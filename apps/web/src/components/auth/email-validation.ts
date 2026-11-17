export type EmailValidationMessages = {
  required: string;
  missingAt: string;
  missingEnding: string;
  invalid: string;
};

export function validateEmail(email: string, messages: EmailValidationMessages) {
  const value = email.trim();

  if (!value) return messages.required;

  const atIndex = value.indexOf("@");
  if (atIndex < 0) return messages.missingAt;
  if (atIndex === 0 || atIndex !== value.lastIndexOf("@")) return messages.invalid;

  const domain = value.slice(atIndex + 1);
  if (!domain.includes(".") || domain.endsWith(".")) return messages.missingEnding;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return messages.invalid;

  return undefined;
}
