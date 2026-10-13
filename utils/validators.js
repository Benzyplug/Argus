const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  return email.length <= 254 && EMAIL_RE.test(email);
}

module.exports = { isEmail };
