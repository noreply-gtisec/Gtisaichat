export const ALLOWED_DOMAIN = 'gtisec.com';

/**
 * Validate if email belongs to @gtisec.com
 */
export const validateDomain = (email) => {
  if (!email) return false;
  return email.toLowerCase().trim().endsWith(`@${ALLOWED_DOMAIN}`);
};

/**
 * Helper to extract formatted user profile details (name, email, avatar)
 */
export const formatUserData = (u) => {
  if (!u) return null;
  const email = u.email || '';
  const rawName =
    u.user_metadata?.full_name ||
    u.user_metadata?.name ||
    u.user_metadata?.displayName ||
    (email ? email.split('@')[0].replace(/[._-]/g, ' ') : '') ||
    'Security Officer';

  const formattedName = rawName
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const avatar =
    u.user_metadata?.avatar_url ||
    u.user_metadata?.picture ||
    null;

  return {
    name: formattedName,
    email: email,
    avatar: avatar,
  };
};
