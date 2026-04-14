export const relationLabelOptions = ['S/o', 'D/o', 'W/o', 'C/o'];

export const genderOptions = ['Male', 'Female', 'Other'];

export const advocateDraftingFields = [
  'name',
  'phone',
  'officeAddress',
  'enrollmentNumber',
  'email',
];

export const clientDraftingFields = [
  'name',
  'relationLabel',
  'relationName',
  'age',
  'dateOfBirth',
  'gender',
  'address',
  'aadhaarName',
  'aadhaarNumber',
  'preferredLanguage',
];

const hasValue = (value) => String(value || '').trim().length > 0;

export const isAdvocateDraftReady = (profile = {}) =>
  advocateDraftingFields.every((field) => hasValue(profile[field]));

export const isClientDraftReady = (client = {}) =>
  clientDraftingFields.every((field) => hasValue(client[field]));

export const clientDraftMissingFields = (client = {}) =>
  clientDraftingFields.filter((field) => !hasValue(client[field]));

export const advocateDraftMissingFields = (profile = {}) =>
  advocateDraftingFields.filter((field) => !hasValue(profile[field]));

export const buildClientDraftingSummary = (client = {}) => {
  const identityLine = [client.name, client.relationLabel && client.relationName ? `${client.relationLabel} ${client.relationName}` : '']
    .filter(Boolean)
    .join(' | ');
  const demographicLine = [client.age ? `${client.age} years` : '', client.dateOfBirth || '', client.gender || '']
    .filter(Boolean)
    .join(' | ');

  return [identityLine, demographicLine, client.address || ''].filter(Boolean);
};

