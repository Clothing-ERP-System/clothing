export function evaluatePasswordStrength(password) {
  const pwd = String(password || '');
  const checks = {
    minLength: pwd.length >= 12,
    hasUpper: /[A-Z]/.test(pwd),
    hasLower: /[a-z]/.test(pwd),
    hasNumber: /[0-9]/.test(pwd),
    hasSpecial: /[^A-Za-z0-9]/.test(pwd),
  };

  const passedCount = Object.values(checks).filter(Boolean).length;
  let score = 0;
  let label = 'Weak';
  let colorClass = 'bg-rose-500';
  let textClass = 'text-rose-600 dark:text-rose-400';

  if (checks.minLength) {
    if (passedCount === 5) {
      score = 4;
      label = 'Strong';
      colorClass = 'bg-emerald-500';
      textClass = 'text-emerald-600 dark:text-emerald-400';
    } else if (passedCount === 4) {
      score = 3;
      label = 'Good';
      colorClass = 'bg-blue-500';
      textClass = 'text-blue-600 dark:text-blue-400';
    } else if (passedCount >= 2) {
      score = 2;
      label = 'Fair';
      colorClass = 'bg-amber-500';
      textClass = 'text-amber-600 dark:text-amber-400';
    } else {
      score = 1;
      label = 'Weak';
      colorClass = 'bg-rose-500';
      textClass = 'text-rose-600 dark:text-rose-400';
    }
  } else if (pwd.length > 0) {
    score = 1;
    label = 'Weak';
    colorClass = 'bg-rose-500';
    textClass = 'text-rose-600 dark:text-rose-400';
  }

  const isValid = checks.minLength && checks.hasUpper && checks.hasLower && checks.hasNumber && checks.hasSpecial;

  return {
    ...checks,
    score,
    label,
    colorClass,
    textClass,
    isValid,
  };
}

