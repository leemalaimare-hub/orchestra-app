// RFC 2822 MIME message builder, used for the Gmail API (base64url raw send).
import 'server-only';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  mimeType: string;
}

function encodeHeader(value: string): string {
  // RFC 2047 encode if non-ASCII
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

/** Builds a MIME message and returns it base64url-encoded (for Gmail users.messages.send). */
export function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}): string {
  const boundary = `bndry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const hasAttachments = !!params.attachments && params.attachments.length > 0;

  const fromDomain = params.from.split('@')[1] || 'callscade.com';
  const headers: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${fromDomain}>`,
    'MIME-Version: 1.0',
  ];
  if (params.replyTo) headers.push(`Reply-To: ${params.replyTo}`);

  let body: string;
  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const parts: string[] = [];
    parts.push(
      `--${boundary}\r\n` +
      'Content-Type: text/html; charset="UTF-8"\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      Buffer.from(params.html, 'utf-8').toString('base64'),
    );
    for (const att of params.attachments!) {
      parts.push(
        `--${boundary}\r\n` +
        `Content-Type: ${att.mimeType}; name="${att.filename}"\r\n` +
        'Content-Transfer-Encoding: base64\r\n' +
        `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n` +
        att.content.toString('base64'),
      );
    }
    body = parts.join('\r\n') + `\r\n--${boundary}--`;
  } else {
    headers.push('Content-Type: text/html; charset="UTF-8"');
    headers.push('Content-Transfer-Encoding: base64');
    body = Buffer.from(params.html, 'utf-8').toString('base64');
  }

  const message = headers.join('\r\n') + '\r\n\r\n' + body;
  return Buffer.from(message, 'utf-8').toString('base64url');
}
