const submittingForms = new WeakSet();

export async function preventDuplicateSubmit(event, handler) {
  const form = event.currentTarget;
  if (form && submittingForms.has(form)) {
    event.preventDefault();
    return;
  }

  if (form) submittingForms.add(form);
  try {
    return await handler(event);
  } finally {
    if (form) submittingForms.delete(form);
  }
}
