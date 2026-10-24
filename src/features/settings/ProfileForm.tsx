import { TextField } from "../../components";
import type { ProfileFormErrors, ProfileFormState } from "./profileFormModel";

interface ProfileFormProps {
  form: ProfileFormState;
  errors: ProfileFormErrors;
  onFieldChange: (field: keyof ProfileFormState, value: string) => void;
  /** Prefix for field ids, unique per mount point ("settings", "setup"). */
  idPrefix: string;
}

/**
 * The six profile fields on the design system, with inline errors.
 * Shared by first-launch setup and Settings (audit F-06); state and
 * validation live in profileFormModel so every mount point shares
 * them. The stale "address search arrives in a later update" hint
 * is gone (F-24).
 */
export default function ProfileForm({
  form,
  errors,
  onFieldChange,
  idPrefix,
}: ProfileFormProps) {
  return (
    <>
      <TextField
        id={`${idPrefix}-name`}
        label="Name"
        autoComplete="name"
        required
        value={form.name}
        error={errors.name}
        onChange={(event) => onFieldChange("name", event.target.value)}
      />
      <TextField
        id={`${idPrefix}-tech-id`}
        label="Tech ID"
        required
        value={form.tech_id}
        error={errors.tech_id}
        onChange={(event) => onFieldChange("tech_id", event.target.value)}
      />
      <TextField
        id={`${idPrefix}-home-address`}
        label="Home address (full)"
        autoComplete="street-address"
        required
        value={form.home_address}
        error={errors.home_address}
        hint="Type the full address, including the city. It is shown in full on reports."
        onChange={(event) => onFieldChange("home_address", event.target.value)}
      />
      <TextField
        id={`${idPrefix}-office-name`}
        label="Office name"
        required
        value={form.office_name}
        error={errors.office_name}
        onChange={(event) => onFieldChange("office_name", event.target.value)}
      />
      <TextField
        id={`${idPrefix}-office-address`}
        label="Office address"
        required
        value={form.office_address}
        error={errors.office_address}
        onChange={(event) => onFieldChange("office_address", event.target.value)}
      />
      <TextField
        id={`${idPrefix}-home-office-km`}
        label="Distance Home – Office (km)"
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        required
        value={form.home_office_km}
        error={errors.home_office_km}
        hint="Home ↔ Office driving is commute and is not claimable. A Home ↔ customer leg is claimable for the distance beyond this."
        onChange={(event) => onFieldChange("home_office_km", event.target.value)}
      />
    </>
  );
}
