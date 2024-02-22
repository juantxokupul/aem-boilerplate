import createField from './form-fields.js';
import { sampleRUM } from '../../scripts/aem.js';

async function createForm(formHref, formConfig) {
  const { pathname } = new URL(formHref);
  const resp = await fetch(pathname);
  const json = await resp.json();

  const form = document.createElement('form');
  // eslint-disable-next-line prefer-destructuring
  form.dataset.action = pathname.split('.json')[0];

  formConfig.fields = await Promise.all(json.data.map((fd) => createField(fd, form)));

  form.addEventListener('webkitAnimationEnd', function(a) {
    if (a.animationName === 'fadeIn') {
      return;
    } 
    a.target.style.animationName = 'fadeIn';

    form.replaceChildren();
    generateFormfields(form, formConfig);

    form.setAttribute('data-submitting', 'false');
    form.querySelector('button[type="submit"]').disabled = false;
  });

  generateFormfields(form, formConfig);

  return form;
}

function generateFormfields(form, formConfig) {

  formConfig.fields.forEach((field) => {
    const step = +field?.dataset.step;
    if (!step) {
      return;
    }

    if (step === formConfig.currentStep || step === -1) {
      if (field.dataset.submitLabel) {
        const button = field.querySelector('button');
        button.textContent = formConfig.currentStep < formConfig.maxSteps ? field.dataset.submitStepLabel : field.dataset.submitLabel;
      }

      form.append(field);
    } else {
      if (step > formConfig.maxSteps) {
        formConfig.maxSteps = step;
      }
    }
  });

  // group fields into fieldsets
  const fieldsets = form.querySelectorAll('fieldset');
  fieldsets.forEach((fieldset) => {
    form.querySelectorAll(`[data-fieldset="${fieldset.name}"`).forEach((field) => {
      fieldset.append(field);
    });
  });

  formConfig.block.replaceChildren(form);
}

function generatePayload(form, formConfig) {
  const payload = formConfig.payload;

  [...form.elements].forEach((field) => {
    if (field.name && field.type !== 'submit' && !field.disabled) {
      if (field.type === 'radio') {
        if (field.checked) payload[field.name] = field.value;
      } else if (field.type === 'checkbox') {
        if (field.checked) payload[field.name] = payload[field.name] ? `${payload[field.name]},${field.value}` : field.value;
      } else {
        payload[field.name] = field.value;
      }
    }
  });
}

function handleSubmitError(form, error) {
  // eslint-disable-next-line no-console
  console.error(error);
  form.querySelector('button[type="submit"]').disabled = false;
  sampleRUM('form:error', { source: '.form', target: error.stack || error.message || 'unknown error' });
}

async function handleSubmit(form, formConfig) {
  if (form.getAttribute('data-submitting') === 'true') return;

  const submit = form.querySelector('button[type="submit"]');
  try {
    form.setAttribute('data-submitting', 'true');
    submit.disabled = true;

    // create payload
    generatePayload(form, formConfig);

    // generate next step
    if (formConfig.currentStep < formConfig.maxSteps) {
      formConfig.currentStep++;
  
      setTimeout(() => {
        form.style.animationName = 'fadeOut';
        form.style.animationDuration = '600ms';
      }, 200);

      return;
    } 

    const response = await fetch(form.dataset.action, {
      method: 'POST',
      body: JSON.stringify({ data: formConfig.payload }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      sampleRUM('form:submit', { source: '.form', target: form.dataset.action });
      if (form.dataset.confirmation) {
        window.location.href = form.dataset.confirmation;
      }
    } else {
      const error = await response.text();
      throw new Error(error);
    }
  } catch (e) {
    handleSubmitError(form, e);
  } finally {
    form.setAttribute('data-submitting', 'false');
  }
}

export default async function decorate(block) {
  const formLink = block.querySelector('a[href$=".json"]');
  if (!formLink) return;

  const formConfig = {
    fields: undefined,
    payload: {},
    currentStep: 1,
    maxSteps: 1,
    block: block,
  }

  const form = await createForm(formLink.href, formConfig);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const valid = form.checkValidity();
    if (valid) {
      handleSubmit(form, formConfig);
    } else {
      const firstInvalidEl = form.querySelector(':invalid:not(fieldset)');
      if (firstInvalidEl) {
        firstInvalidEl.focus();
        firstInvalidEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
}
