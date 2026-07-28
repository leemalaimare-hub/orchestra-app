// Template variable substitution engine.
// renderTemplate() is used by the send engine (Part 7).
// renderPreview() is used by the template preview modal.

export interface TemplateVariables {
  name: string;              // musician first name
  full_name: string;         // musician full name
  position: string;
  concert_name: string;
  date: string;              // formatted date string
  venue: string;
  deadline: string;          // formatted deadline
  organization_name: string;
  pay_rate: string;          // formatted pay per service, e.g. "$120"
  rehearsal_schedule: string; // formatted multi-line rehearsal list
  event_timezone: string;    // e.g. "EST"
}

export const TEMPLATE_VARIABLES: { key: keyof TemplateVariables; description: string }[] = [
  { key: 'name', description: "Musician's first name" },
  { key: 'full_name', description: "Musician's full name" },
  { key: 'position', description: 'Position being filled (e.g. Violin)' },
  { key: 'concert_name', description: 'Name of the concert' },
  { key: 'date', description: 'Concert date(s) formatted nicely' },
  { key: 'venue', description: 'Concert venue' },
  { key: 'deadline', description: 'Response deadline date and time' },
  { key: 'organization_name', description: 'Your orchestra name' },
  { key: 'pay_rate', description: 'Pay per service for this position (e.g. $120)' },
  { key: 'rehearsal_schedule', description: 'Rehearsal dates, times, and locations' },
  { key: 'event_timezone', description: 'Timezone abbreviation for the event (e.g. EST)' },
];

interface RenderOptions {
  /** When a variable has no value: 'keep' leaves {{var}} as-is, 'blank' replaces with '' */
  missing?: 'keep' | 'blank';
}

function substitute(text: string, variables: Partial<TemplateVariables>, missing: 'keep' | 'blank'): string {
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, rawKey) => {
    const key = String(rawKey).toLowerCase() as keyof TemplateVariables;
    const value = variables[key];
    if (value !== undefined && value !== null) return String(value);
    return missing === 'blank' ? '' : match;
  });
}

/**
 * Replaces all {{variable}} occurrences in subject and body.
 * Case-insensitive ({{Name}} === {{name}}). Missing variables are
 * left as-is by default ('keep'), or blanked with { missing: 'blank' }.
 */
export function renderTemplate(
  template: { subject: string; body: string },
  variables: Partial<TemplateVariables>,
  options: RenderOptions = {},
): { subject: string; body: string } {
  const missing = options.missing ?? 'keep';
  return {
    subject: substitute(template.subject, variables, missing),
    body: substitute(template.body, variables, missing),
  };
}

export const SAMPLE_VARIABLES: TemplateVariables = {
  name: 'Sarah',
  full_name: 'Sarah Johnson',
  position: 'Violin',
  concert_name: 'Masterworks Concert',
  date: 'Friday, November 7, 2025 at 7:30 PM',
  venue: 'Van Wezel Performing Arts Hall',
  deadline: 'Wednesday, November 5, 2025 at 5:00 PM',
  organization_name: 'Sarasota Orchestra',
  pay_rate: '$120',
  rehearsal_schedule: 'Wed, Nov 5 at 7:00 PM — Main Rehearsal Hall\nThu, Nov 6 at 7:00 PM — Main Rehearsal Hall',
  event_timezone: 'EST',
};

/** Renders the template with sample data — used by the preview modal. */
export function renderPreview(template: { subject: string; body: string }): { subject: string; body: string } {
  return renderTemplate(template, SAMPLE_VARIABLES, { missing: 'blank' });
}
