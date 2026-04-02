import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import PageShell from './PageShell';
import { buildCaseAccessLink } from '../utils/caseAccess';

const Invite = () => {
  const [caseLinks, setCaseLinks] = useState([]);

  useEffect(() => {
    const loadCases = async () => {
      const advocateId = auth.currentUser?.uid;
      if (!advocateId) return;
      const snapshot = await getDocs(query(collection(db, 'cases'), where('advocate_id', '==', advocateId)));
      setCaseLinks(snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    };

    loadCases();
  }, []);

  const copyLink = async (token) => {
    await navigator.clipboard.writeText(buildCaseAccessLink(token));
    alert('Client case link copied.');
  };

  return (
    <PageShell
      title="Client access links"
      subtitle="Share a client-safe case view over WhatsApp, SMS, or email. The link remains active until the case is concluded or you disable it."
      showBack
    >
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Shareable case access</p>
            <h2>{caseLinks.length} links</h2>
          </div>
        </div>
        {caseLinks.length === 0 ? (
          <p className="empty-state">No cases available yet. Add a case first, then return here to copy its client link.</p>
        ) : (
          <div className="record-list">
            {caseLinks.map((caseItem) => (
              <article key={caseItem.id} className="record-item record-item--stack">
                <div>
                  <strong>{caseItem.case_number}</strong>
                  <p>{caseItem.client_name}</p>
                </div>
                <div className="case-link-panel">
                  <input value={buildCaseAccessLink(caseItem.client_access_token)} readOnly />
                  <button type="button" className="button" onClick={() => copyLink(caseItem.client_access_token)}>
                    Copy client link
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default Invite;
