const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const vision = require('@google-cloud/vision');
const pdfParse = require('pdf-parse');
const { GoogleAuth } = require('google-auth-library');
const { Document, HeadingLevel, Packer, Paragraph, TextRun } = require('docx');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', timeoutSeconds: 540, memory: '1GiB' });

const db = admin.firestore();
const bucket = admin.storage().bucket();
const storageClient = new Storage();
const visionClient = new vision.ImageAnnotatorClient();
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const DEFAULT_VERTEX_LOCATION = 'global';
const DEFAULT_VERTEX_MODEL = 'gemini-2.0-flash-001';
const SUFFICIENT_TEXT_LENGTH = 120;

function getProjectId() {
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.app().options.projectId;
}

function getVertexLocation() {
  return process.env.VERTEX_AI_LOCATION || DEFAULT_VERTEX_LOCATION;
}

function getVertexModel() {
  return process.env.VERTEX_AI_MODEL || DEFAULT_VERTEX_MODEL;
}

async function requireAdvocate(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!userSnap.exists || userSnap.data()?.role !== 'advocate') {
    throw new HttpsError('permission-denied', 'Only advocates can use drafting tools.');
  }

  return {
    uid: request.auth.uid,
    profile: userSnap.data(),
  };
}

async function getOwnedSession(sessionId, advocateId) {
  const sessionSnap = await db.collection('drafting_sessions').doc(sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Drafting session not found.');
  }

  const session = { id: sessionSnap.id, ...sessionSnap.data() };
  if (session.advocate_id !== advocateId) {
    throw new HttpsError('permission-denied', 'This drafting session belongs to another advocate.');
  }

  return session;
}

async function getOwnedCase(caseId, advocateId) {
  if (!caseId) {
    return null;
  }

  const caseSnap = await db.collection('cases').doc(caseId).get();
  if (!caseSnap.exists) {
    throw new HttpsError('not-found', 'Case not found.');
  }

  const caseRecord = { id: caseSnap.id, ...caseSnap.data() };
  if (caseRecord.advocate_id !== advocateId) {
    throw new HttpsError('permission-denied', 'This case belongs to another advocate.');
  }

  return caseRecord;
}

async function getOwnedDocument(documentId, advocateId) {
  const docSnap = await db.collection('documents').doc(documentId).get();
  if (!docSnap.exists) {
    throw new HttpsError('not-found', 'Document not found.');
  }

  const documentRecord = { id: docSnap.id, ...docSnap.data() };
  if (documentRecord.advocate_id !== advocateId) {
    throw new HttpsError('permission-denied', 'This document belongs to another advocate.');
  }

  return documentRecord;
}

function cleanExtractedText(text) {
  return (text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function hasSufficientText(text) {
  return cleanExtractedText(text).length >= SUFFICIENT_TEXT_LENGTH;
}

function formatTimestamp(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value.toDate) {
    return value.toDate().toISOString();
  }
  return String(value);
}

function getGsUriForPath(storagePath) {
  return `gs://${bucket.name}/${storagePath}`;
}

async function bufferFromSource(source) {
  if (source.storage_path) {
    const [buffer] = await bucket.file(source.storage_path).download();
    return buffer;
  }

  if (source.url) {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Source download failed with status ${response.status}.`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('No supported source location was found.');
}

async function ensurePdfGcsUri(source, buffer) {
  if (source.storage_path && source.storage_path.endsWith('.pdf')) {
    return {
      uri: getGsUriForPath(source.storage_path),
      tempPath: null,
    };
  }

  const tempPath = `drafting-system/${source.advocate_id}/sessions/${source.session_id}/ocr-inputs/${source.id}.pdf`;
  await bucket.file(tempPath).save(buffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });
  return {
    uri: getGsUriForPath(tempPath),
    tempPath,
  };
}

async function cleanupBucketPrefix(prefix) {
  const [files] = await storageClient.bucket(bucket.name).getFiles({ prefix });
  await Promise.all(files.map((file) => file.delete().catch(() => null)));
}

async function runPdfVisionOcr(source, buffer) {
  const { uri, tempPath } = await ensurePdfGcsUri(source, buffer);
  const outputPrefix = `drafting-system/${source.advocate_id}/sessions/${source.session_id}/ocr-output/${source.id}/`;
  const outputUri = `gs://${bucket.name}/${outputPrefix}`;

  try {
    const [operation] = await visionClient.asyncBatchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            gcsSource: { uri },
            mimeType: 'application/pdf',
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          outputConfig: {
            gcsDestination: { uri: outputUri },
            batchSize: 1,
          },
        },
      ],
    });

    await operation.promise();
    const [files] = await storageClient.bucket(bucket.name).getFiles({ prefix: outputPrefix });
    let fullText = '';

    for (const file of files) {
      const [contents] = await file.download();
      const payload = JSON.parse(contents.toString('utf8'));
      const responses = payload.responses || [];
      for (const response of responses) {
        fullText += `${response.fullTextAnnotation?.text || ''}\n`;
      }
    }

    return cleanExtractedText(fullText);
  } finally {
    if (tempPath) {
      await bucket.file(tempPath).delete().catch(() => null);
    }
    await cleanupBucketPrefix(outputPrefix).catch(() => null);
  }
}

async function runImageVisionOcr(buffer) {
  const [result] = await visionClient.documentTextDetection({
    image: { content: buffer.toString('base64') },
  });
  return cleanExtractedText(result.fullTextAnnotation?.text || '');
}

async function extractSourceText(source) {
  if (source.source_type === 'typed_text') {
    const manualText = cleanExtractedText(source.reviewed_text || source.raw_extracted_text || '');
    if (!manualText) {
      throw new Error('Manual text is empty.');
    }

    return {
      rawText: manualText,
      reviewedText: manualText,
      extractionMethod: 'manual_text',
      usedOcr: false,
    };
  }

  const mimeType = source.mime_type || '';
  const buffer = await bufferFromSource(source);

  if (mimeType.startsWith('text/')) {
    const text = cleanExtractedText(buffer.toString('utf8'));
    return {
      rawText: text,
      reviewedText: text,
      extractionMethod: 'native_text',
      usedOcr: false,
    };
  }

  if (mimeType === 'application/pdf' || source.name?.toLowerCase().endsWith('.pdf')) {
    let nativeText = '';
    try {
      const parsed = await pdfParse(buffer);
      nativeText = cleanExtractedText(parsed.text || '');
    } catch (error) {
      nativeText = '';
    }

    if (hasSufficientText(nativeText)) {
      return {
        rawText: nativeText,
        reviewedText: nativeText,
        extractionMethod: 'native_text',
        usedOcr: false,
      };
    }

    const ocrText = await runPdfVisionOcr(source, buffer);
    if (!ocrText) {
      throw new Error('OCR could not extract any readable text from the PDF.');
    }

    return {
      rawText: ocrText,
      reviewedText: ocrText,
      extractionMethod: 'vision_ocr',
      usedOcr: true,
    };
  }

  if (mimeType.startsWith('image/')) {
    const ocrText = await runImageVisionOcr(buffer);
    if (!ocrText) {
      throw new Error('OCR could not extract any readable text from the image.');
    }

    return {
      rawText: ocrText,
      reviewedText: ocrText,
      extractionMethod: 'vision_ocr',
      usedOcr: true,
    };
  }

  throw new Error('This file type is not supported for drafting yet.');
}

function buildPrompt({ session, caseRecord, sources }) {
  const draftType = session.custom_draft_type?.trim() || session.draft_type;
  const language = session.output_language === 'hi' ? 'Hindi' : 'English';
  const caseContext = caseRecord
    ? [
        `Case number: ${caseRecord.case_number || ''}`,
        `Client name: ${caseRecord.client_name || ''}`,
        `Court: ${caseRecord.court || ''}`,
        `Current status: ${caseRecord.status || ''}`,
        `Matter summary: ${caseRecord.summary || ''}`,
        `Next step: ${caseRecord.next_step || ''}`,
      ]
        .filter(Boolean)
        .join('\n')
    : 'No case metadata was linked for this drafting session.';

  const sourceText = sources
    .map((source, index) => {
      const heading = `Source ${index + 1}: ${source.name || source.label || source.source_type}`;
      return `${heading}\n${source.reviewed_text || source.raw_extracted_text || ''}`;
    })
    .join('\n\n---\n\n');

  return [
    `You are an AI legal drafting assistant for an Indian advocate.`,
    `Prepare a first-draft ${draftType} in ${language}.`,
    `The draft must be professional, structured, and ready for advocate review.`,
    `Do not invent facts that are missing from the source material.`,
    `If a fact is uncertain, mark it as [To be confirmed].`,
    `Use headings and numbered paragraphs where appropriate.`,
    `Include a short "Review notes" section at the end listing factual gaps or items that need advocate validation.`,
    '',
    'Case context:',
    caseContext,
    '',
    'Advocate instructions:',
    session.instructions?.trim() || 'No extra instructions were provided.',
    '',
    'Source materials:',
    sourceText,
  ].join('\n');
}

async function generateWithVertex(prompt) {
  const projectId = getProjectId();
  const location = getVertexLocation();
  const model = getVertexModel();
  const authClient = await googleAuth.getClient();
  const accessTokenResponse = await authClient.getAccessToken();
  const accessToken = accessTokenResponse?.token || accessTokenResponse;

  if (!accessToken) {
    throw new Error('Could not obtain a Google access token for AI generation.');
  }

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI generation failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text || '').join('\n').trim();

  if (!text) {
    throw new Error('Vertex AI returned an empty draft.');
  }

  return {
    text,
    model,
    location,
  };
}

function buildDocxDocument(title, body, session, caseRecord) {
  const paragraphs = body.split(/\n{2,}/).map((block) =>
    new Paragraph({
      spacing: { after: 220 },
      children: [new TextRun(block.trim())],
    })
  );

  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 240 },
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `Generated by iAdvocate on ${new Date().toLocaleString('en-IN')}`,
                italics: true,
              }),
            ],
          }),
          caseRecord?.case_number
            ? new Paragraph({
                text: `Case number: ${caseRecord.case_number}`,
                spacing: { after: 180 },
              })
            : new Paragraph(''),
          ...paragraphs,
          new Paragraph({
            spacing: { before: 240 },
            children: [
              new TextRun({
                text: 'AI-assisted first draft. Advocate review is mandatory before use or sharing.',
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });
}

async function upsertDraftingOutput(sessionId, advocateId, payload) {
  const outputQuery = await db
    .collection('drafting_outputs')
    .where('session_id', '==', sessionId)
    .limit(1)
    .get();

  if (outputQuery.empty) {
    const ref = await db.collection('drafting_outputs').add({
      session_id: sessionId,
      advocate_id: advocateId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      ...payload,
    });
    return ref.id;
  }

  const docRef = outputQuery.docs[0].ref;
  await docRef.update({
    ...payload,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

exports.createDraftingSession = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const caseRecord = await getOwnedCase(data.caseId || '', advocate.uid);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const sessionRef = await db.collection('drafting_sessions').add({
    advocate_id: advocate.uid,
    case_id: caseRecord?.id || '',
    case_number: caseRecord?.case_number || '',
    client_name: caseRecord?.client_name || '',
    draft_type: data.draftType || 'legal_notice',
    custom_draft_type: data.customDraftType || '',
    output_language: data.outputLanguage || caseRecord?.client_language || advocate.profile.preferredLanguage || 'en',
    instructions: data.instructions || '',
    status: 'draft',
    source_count: 0,
    ocr_source_count: 0,
    created_at: now,
    updated_at: now,
  });

  return {
    sessionId: sessionRef.id,
  };
});

exports.registerDraftingSource = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);

  let sourcePayload = {
    session_id: session.id,
    advocate_id: advocate.uid,
    source_type: data.sourceType,
    label: data.label || '',
    name: data.name || '',
    mime_type: data.mimeType || '',
    url: data.url || '',
    storage_path: data.storagePath || '',
    existing_document_id: data.existingDocumentId || '',
    extraction_method: data.sourceType === 'typed_text' ? 'manual_text' : '',
    raw_extracted_text: '',
    reviewed_text: '',
    status: data.sourceType === 'typed_text' ? 'ready_for_review' : 'pending',
    used_ocr: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (data.sourceType === 'existing_document' && data.existingDocumentId) {
    const documentRecord = await getOwnedDocument(data.existingDocumentId, advocate.uid);
    sourcePayload = {
      ...sourcePayload,
      name: documentRecord.name || sourcePayload.name,
      mime_type: documentRecord.mime_type || sourcePayload.mime_type,
      url: documentRecord.url || sourcePayload.url,
      storage_path: documentRecord.storage_path || sourcePayload.storage_path,
      case_id: documentRecord.case_id || '',
    };
  }

  if (data.sourceType === 'typed_text') {
    const manualText = cleanExtractedText(data.typedText || '');
    if (!manualText) {
      throw new HttpsError('invalid-argument', 'Typed text cannot be empty.');
    }
    sourcePayload.raw_extracted_text = manualText;
    sourcePayload.reviewed_text = manualText;
  }

  const sourceRef = await db.collection('drafting_sources').add(sourcePayload);
  await db.collection('drafting_sessions').doc(session.id).update({
    source_count: admin.firestore.FieldValue.increment(1),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    sourceId: sourceRef.id,
  };
});

exports.extractDraftingSources = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);
  const sourceIds = Array.isArray(data.sourceIds) ? data.sourceIds : [];

  let sourceQuery = db.collection('drafting_sources')
    .where('session_id', '==', session.id);

  const snapshot = await sourceQuery.get();
  const targets = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ref: docSnap.ref, ...docSnap.data() }))
    .filter((source) => (sourceIds.length ? sourceIds.includes(source.id) : source.status !== 'ready_for_review'));

  if (!targets.length) {
    throw new HttpsError('failed-precondition', 'No drafting sources are waiting for extraction.');
  }

  await db.collection('drafting_sessions').doc(session.id).update({
    status: 'extracting',
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  let readyCount = 0;
  let ocrCount = 0;
  const results = [];

  for (const source of targets) {
    try {
      const extraction = await extractSourceText(source);
      await source.ref.update({
        raw_extracted_text: extraction.rawText,
        reviewed_text: extraction.reviewedText,
        extraction_method: extraction.extractionMethod,
        used_ocr: extraction.usedOcr,
        status: 'ready_for_review',
        error_message: admin.firestore.FieldValue.delete(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      readyCount += 1;
      if (extraction.usedOcr) {
        ocrCount += 1;
      }
      results.push({
        sourceId: source.id,
        status: 'ready_for_review',
        extractionMethod: extraction.extractionMethod,
      });
    } catch (error) {
      await source.ref.update({
        status: 'failed',
        error_message: error.message,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      results.push({
        sourceId: source.id,
        status: 'failed',
        errorMessage: error.message,
      });
    }
  }

  const refreshed = await db
    .collection('drafting_sources')
    .where('session_id', '==', session.id)
    .get();

  const readySources = refreshed.docs.filter((docSnap) => docSnap.data().status === 'ready_for_review').length;
  const totalOcrSources = refreshed.docs.filter((docSnap) => docSnap.data().used_ocr === true).length;

  await db.collection('drafting_sessions').doc(session.id).update({
    status: readySources > 0 ? 'ready_for_review' : 'failed',
    ocr_source_count: totalOcrSources,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    results,
    readyCount,
    ocrCount,
  };
});

exports.generateDraftingOutput = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);

  const sourcesSnapshot = await db
    .collection('drafting_sources')
    .where('session_id', '==', session.id)
    .get();

  const sources = sourcesSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((source) => cleanExtractedText(source.reviewed_text || source.raw_extracted_text || '').length > 0);

  if (!sources.length) {
    throw new HttpsError('failed-precondition', 'Add and review at least one usable source before generation.');
  }

  await db.collection('drafting_sessions').doc(session.id).update({
    status: 'generating',
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  const caseRecord = session.case_id ? await getOwnedCase(session.case_id, advocate.uid) : null;
  const prompt = buildPrompt({ session, caseRecord, sources });

  try {
    const generation = await generateWithVertex(prompt);
    const outputId = await upsertDraftingOutput(session.id, advocate.uid, {
      generated_text: generation.text,
      edited_text: generation.text,
      model: generation.model,
      provider: 'vertex_ai',
      prompt_summary: {
        draft_type: session.custom_draft_type?.trim() || session.draft_type,
        output_language: session.output_language,
        source_count: sources.length,
        includes_case_context: Boolean(caseRecord),
      },
    });

    await db.collection('drafting_sessions').doc(session.id).update({
      status: 'completed',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      outputId,
      generatedText: generation.text,
    };
  } catch (error) {
    await db.collection('drafting_sessions').doc(session.id).update({
      status: 'failed',
      last_error: error.message,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError('internal', error.message);
  }
});

exports.exportDraftingDocx = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);
  const outputSnap = await db.collection('drafting_outputs').doc(data.outputId).get();

  if (!outputSnap.exists) {
    throw new HttpsError('not-found', 'Draft output not found.');
  }

  const output = { id: outputSnap.id, ...outputSnap.data() };
  if (output.advocate_id !== advocate.uid || output.session_id !== session.id) {
    throw new HttpsError('permission-denied', 'This draft output belongs to another advocate.');
  }

  const caseRecord = session.case_id ? await getOwnedCase(session.case_id, advocate.uid) : null;
  const title = session.custom_draft_type?.trim() || session.draft_type || 'Legal draft';
  const document = buildDocxDocument(title, output.edited_text || output.generated_text || '', session, caseRecord);
  const buffer = await Packer.toBuffer(document);
  const exportPath = `drafting/${advocate.uid}/sessions/${session.id}/exports/${Date.now()}-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}.docx`;

  await bucket.file(exportPath).save(buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });

  await outputSnap.ref.update({
    docx_export_path: exportPath,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    exportPath,
  };
});

exports.publishDraftingOutput = onCall(async (request) => {
  const advocate = await requireAdvocate(request);
  const data = request.data || {};
  const session = await getOwnedSession(data.sessionId, advocate.uid);
  const caseRecord = await getOwnedCase(session.case_id, advocate.uid);
  const outputSnap = await db.collection('drafting_outputs').doc(data.outputId).get();

  if (!outputSnap.exists) {
    throw new HttpsError('not-found', 'Draft output not found.');
  }

  const output = { id: outputSnap.id, ...outputSnap.data() };
  if (output.advocate_id !== advocate.uid || output.session_id !== session.id) {
    throw new HttpsError('permission-denied', 'This draft output belongs to another advocate.');
  }

  const title = session.custom_draft_type?.trim() || session.draft_type || 'Legal draft';
  const document = buildDocxDocument(title, output.edited_text || output.generated_text || '', session, caseRecord);
  const buffer = await Packer.toBuffer(document);
  const publishedPath = `documents/${advocate.uid}/${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.docx`;

  await bucket.file(publishedPath).save(buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0',
    },
  });

  const documentRef = await db.collection('documents').add({
    advocate_id: advocate.uid,
    case_id: caseRecord.case_number || '',
    type: title,
    name: `${title}.docx`,
    storage_path: publishedPath,
    url: '',
    uploaded_by_role: 'advocate',
    client_access_token: '',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  await outputSnap.ref.update({
    published_document_id: documentRef.id,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    documentId: documentRef.id,
    storagePath: publishedPath,
  };
});
