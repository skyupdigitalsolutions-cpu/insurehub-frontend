import { STATUS_LABEL, type LeadStatus } from '../../api/leads';

// grey = not yet worked, blue = in conversation, amber = close to a sale, green = won, red = lost.
const tone: Record<LeadStatus, string> = {
  NEW: 'bg-tray text-ink-soft', CONTACTED: 'bg-[#E7EFF8] text-focus', FOLLOW_UP: 'bg-[#E7EFF8] text-focus',
  QUALIFIED: 'bg-warn-tint text-warn', CONVERTED: 'bg-ok-tint text-ok', LOST: 'bg-bad-tint text-bad',
};
export function StatusPill({ status }: { status: LeadStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.75rem] ${tone[status]}`}>{STATUS_LABEL[status]}</span>;
}
