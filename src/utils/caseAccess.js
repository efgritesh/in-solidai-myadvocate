export const createCaseAccessToken = (caseNumber) => {
  const normalized = (caseNumber || 'case')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${normalized}-${randomPart}`;
};

export const buildCaseAccessLink = (token) => `${window.location.origin}/case-access/${token}`;
