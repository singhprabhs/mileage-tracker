import type { ProfileInput } from "../../data";
import { DEFAULT_HOME_OFFICE_KM } from "../../domain";

export const DEFAULT_OFFICE_NAME = "Canon";
export const DEFAULT_OFFICE_ADDRESS = "10851 Shellbridge Way, Richmond, BC";

/** The profile form's values, as typed (distance stays a string). */
export interface ProfileFormState {
  name: string;
  tech_id: string;
  home_address: string;
  office_name: string;
  office_address: string;
  home_office_km: string;
}

export const EMPTY_PROFILE_FORM: ProfileFormState = {
  name: "",
  tech_id: "",
  home_address: "",
  office_name: DEFAULT_OFFICE_NAME,
  office_address: DEFAULT_OFFICE_ADDRESS,
  home_office_km: String(DEFAULT_HOME_OFFICE_KM),
};

export type ProfileFormErrors = Partial<Record<keyof ProfileFormState, string>>;

/**
 * The one validator for the profile form — the first-launch setup
 * screen, the Settings Profile section and the Locations sheets all
 * run through it, so the rules and messages can never drift apart
 * (UI Polish Phase 4). Messages are per-field and plain.
 */
export function validateProfileForm(form: ProfileFormState): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  if (!form.name.trim()) errors.name = "Enter your name — it appears on reports.";
  if (!form.tech_id.trim()) errors.tech_id = "Enter your Tech ID — it appears on reports.";
  if (!form.home_address.trim()) errors.home_address = "Enter your full home address.";
  if (!form.office_name.trim()) errors.office_name = "Enter the office name.";
  if (!form.office_address.trim()) errors.office_address = "Enter the office address.";
  const km = Number(form.home_office_km);
  if (!Number.isFinite(km) || km <= 0) {
    errors.home_office_km = "Enter a number above 0, like 23.";
  }
  return errors;
}

export function hasProfileErrors(errors: ProfileFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The trimmed service input for a form that passed validation. */
export function profileInputFromForm(form: ProfileFormState): ProfileInput {
  return {
    name: form.name.trim(),
    tech_id: form.tech_id.trim(),
    home_address: form.home_address.trim(),
    home_office_km: Number(form.home_office_km),
    office_name: form.office_name.trim(),
    office_address: form.office_address.trim(),
  };
}
