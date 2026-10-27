import { api } from './client';

/** Lists and limits from the API (they are CFG values a SkyUp Admin can change, so never typed here). */
export interface Reference {
  leadSources: string[]; lostReasons: string[]; relationships: string[]; insuranceTypes: string[]; pipelineNames: string[];
  documentTypes: string[]; verifyDocumentTypes: string[]; vehicleDocumentTypes: string[]; vehiclePhotoSlots: string[];
  leadStatuses: Array<{ code: string; label: string }>; contactOutcomes: Array<{ code: string; label: string }>; priorities: string[];
  states: string[]; genders: string[]; preferredContacts: string[]; consentHowGiven: string[]; deactivationReasons: string[];
  limits: { otpLength: number; otpValidityMinutes: number; resendSeconds: number; idleMinutes: number; idleWarningMinutes: number; nameMin: number; nameMax: number;
    notesMax: number; pageSize: number; familyMax: number; revealSeconds: number; shortText: { min: number; max: number }; trialDays: number };
}
let cached: Promise<Reference> | null = null;
export const loadReference = (fresh = false) => (cached = fresh || !cached ? api<Reference>('GET', '/reference') : cached);

export const GENDER_LABEL: Record<string, string> = { MALE: 'Male', FEMALE: 'Female', TRANSGENDER: 'Transgender', PREFER_NOT_TO_SAY: 'Prefer not to say' };
export const CONTACT_LABEL: Record<string, string> = { WHATSAPP: 'WhatsApp', PHONE_CALL: 'Phone call', EMAIL: 'Email' };
export const PRIORITY_LABEL: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };