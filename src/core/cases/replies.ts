import type { Reply } from './cases.ts';

/** HTML email body → readable text. Used for display only; the result is always shown as text, never as HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The reference of our message in a subject line, e.g. "RE: [SACM-7K2F9Q] …" → "SACM-7K2F9Q". */
export function referenceIn(subject: string): string {
  const found = /\[(SACM-[A-Z0-9-]+)\]/i.exec(subject);
  return found ? found[1]!.toUpperCase() : '';
}

/** Reads a reply file written by the filing flow. Returns null when it is not a reply to one of our messages. */
export function parseReply(json: string, file: string): Reply | null {
  let data: Record<string, unknown>;
  try { data = JSON.parse(json) as Record<string, unknown>; } catch { return null; }
  const value = (name: string): string => (typeof data[name] === 'string' ? (data[name] as string) : '');
  const subject = value('subject');
  const ref = referenceIn(subject);
  if (!ref) return null;
  const body = value('body');
  return { ref, from: value('from'), received: value('received'), subject, text: body ? htmlToText(body) : value('preview'), file };
}
