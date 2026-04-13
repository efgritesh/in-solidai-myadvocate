export const lifecycleStageTypes = [
  { value: 'general', label: 'General stage' },
  { value: 'hearing', label: 'Hearing' },
];

export const isHearingLifecycleStep = (step = {}) =>
  step.stage_type === 'hearing' ||
  step.type === 'hearing' ||
  /hearing/i.test(step.title || '');

export const formatLifecycleMonth = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-');
    return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
      new Date(Number(year), Number(month) - 1, 1)
    );
  }
  return value;
};

export const formatLifecycleDate = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(Number(year), Number(month) - 1, Number(day)));
  }
  return value;
};

export const getLifecycleDisplayDate = (step = {}) =>
  formatLifecycleDate(step.scheduled_date || '') || formatLifecycleMonth(step.eta || '');

export const createLifecycleStep = ({
  id,
  title,
  eta = '',
  status = 'pending',
  stageType = 'general',
  scheduledDate = '',
  notes = '',
}) => ({
  id: id || `step-${Date.now()}`,
  title,
  eta,
  status,
  stage_type: stageType,
  scheduled_date: scheduledDate,
  notes,
});

export const sortLifecycleForCase = (steps = []) => {
  const history = [];
  const future = [];

  steps.forEach((step) => {
    if (step.status === 'done') {
      history.push(step);
    } else {
      future.push(step);
    }
  });

  return [...history, ...future];
};
