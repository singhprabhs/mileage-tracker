import type { Leg } from "../src/domain/types";

function leg(
  from_name: string,
  from_address: string,
  from_type: Leg["from_type"],
  to_name: string,
  to_address: string,
  to_type: Leg["to_type"],
  odo_start: number,
  odo_end: number,
  parking_cents: number | null = null,
  parking_note: string | null = null,
): Leg {
  return {
    from_name,
    from_address,
    from_type,
    to_name,
    to_address,
    to_type,
    odo_start,
    odo_end,
    parking_cents,
    parking_note,
    note: null,
  };
}

const HOME_ADDRESS = "1 Example Home Street, Vancouver, BC";
const CANON_ADDRESS = "10851 Shellbridge Way, Richmond, BC";
const DSK_LAW_ADDRESS = "970-789 W Pender St, Vancouver BC";
const AGAT_ADDRESS = "3681 E 1st Ave, Vancouver, BC";
const CUSTOMER_A_ADDRESS = "200 Example Road, Burnaby, BC";

/** Fixture A: the sample day, Jul 02. Expected: 85 km distance, 36 km claimable. */
export const fixtureA: Leg[] = [
  leg("Home", HOME_ADDRESS, "home", "Canon", CANON_ADDRESS, "office", 155301, 155325),
  leg("Canon", CANON_ADDRESS, "office", "Dsk Law", DSK_LAW_ADDRESS, "customer", 155325, 155339),
  leg(
    "Dsk Law",
    DSK_LAW_ADDRESS,
    "customer",
    "Agat Laboratories",
    AGAT_ADDRESS,
    "customer",
    155339,
    155347,
  ),
  leg(
    "Agat Laboratories",
    AGAT_ADDRESS,
    "customer",
    "Canon",
    CANON_ADDRESS,
    "office",
    155347,
    155361,
  ),
  leg("Canon", CANON_ADDRESS, "office", "Home", HOME_ADDRESS, "home", 155361, 155386),
];

/** Fixture B: Jul 03, customer at both ends. Expected claimable: 17 then 21. */
export const fixtureB: Leg[] = [
  leg("Home", HOME_ADDRESS, "home", "Customer A", CUSTOMER_A_ADDRESS, "customer", 155386, 155426),
  leg("Customer A", CUSTOMER_A_ADDRESS, "customer", "Home", HOME_ADDRESS, "home", 155426, 155470),
];

/**
 * Fixture C: Fixture A plus parking - $12.50 (note "Street meter") on the
 * leg ending at Dsk Law and $8.00 on the leg ending at Agat Laboratories.
 * Expected parking total: 2050 cents ($20.50); distance/claimable unchanged.
 */
export const fixtureC: Leg[] = fixtureA.map((entry) => {
  if (entry.to_name === "Dsk Law")
    return { ...entry, parking_cents: 1250, parking_note: "Street meter" };
  if (entry.to_name === "Agat Laboratories") return { ...entry, parking_cents: 800 };
  return { ...entry };
});
