import { useEffect, useState, type ComponentType } from "react";
import {
  Badge,
  Banner,
  BottomSheet,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListRow,
  NumericField,
  SearchField,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  SkeletonCard,
  StatusPill,
  TextField,
  Toast,
  AlertTriangleIcon,
  CalendarIcon,
  CarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  GaugeIcon,
  GearIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShareIcon,
  WifiOffIcon,
  type IconProps,
} from "../../components";
import "./styleguide.css";

/**
 * Hidden design-system review page (#/styleguide) — UI Polish Phase 1.
 * Renders every shared component in every state. The theme segmented
 * control forces the page scheme via the tokens' data-theme hooks;
 * the bottom panels preview both schemes side by side regardless.
 */

type ThemeMode = "auto" | "light" | "dark";

const SWATCHES: { name: string; varName: string; note?: string }[] = [
  { name: "Background", varName: "--bg" },
  { name: "Surface", varName: "--surface" },
  { name: "Text", varName: "--text" },
  { name: "Muted text", varName: "--muted" },
  { name: "Accent", varName: "--accent" },
  { name: "Accent soft", varName: "--accent-soft" },
  { name: "Success", varName: "--success" },
  { name: "Success soft", varName: "--success-soft" },
  { name: "Warning", varName: "--warning" },
  { name: "Warning soft", varName: "--warning-soft" },
  { name: "Danger", varName: "--danger" },
  { name: "Danger soft", varName: "--danger-soft" },
  { name: "Border (decorative)", varName: "--border", note: "hairline only" },
  { name: "Input border", varName: "--input-border", note: "≥ 3:1" },
  { name: "Neutral soft", varName: "--neutral-soft" },
  { name: "Focus", varName: "--focus" },
];

const ICONS: { name: string; Icon: ComponentType<IconProps> }[] = [
  { name: "Gear", Icon: GearIcon },
  { name: "Search", Icon: SearchIcon },
  { name: "Close", Icon: CloseIcon },
  { name: "Check", Icon: CheckIcon },
  { name: "Alert", Icon: AlertTriangleIcon },
  { name: "Wi-Fi off", Icon: WifiOffIcon },
  { name: "Back", Icon: ChevronLeftIcon },
  { name: "Forward", Icon: ChevronRightIcon },
  { name: "Plus", Icon: PlusIcon },
  { name: "Map pin", Icon: MapPinIcon },
  { name: "Gauge", Icon: GaugeIcon },
  { name: "Car", Icon: CarIcon },
  { name: "Calendar", Icon: CalendarIcon },
  { name: "Download", Icon: DownloadIcon },
  { name: "Share", Icon: ShareIcon },
  { name: "Refresh", Icon: RefreshIcon },
  { name: "Clock", Icon: ClockIcon },
  { name: "Pencil", Icon: PencilIcon },
];

function MiniSpecimen() {
  return (
    <>
      <Card>
        <div className="ds-sg-stack">
          <span className="ds-sg-type-title3">Card on this scheme</span>
          <span style={{ color: "var(--muted)" }}>Muted text inside a surface card.</span>
          <TextField label="Example field" placeholder="Type here" />
        </div>
      </Card>
      <div className="ds-sg-row">
        <Button>Primary</Button>
        <StatusPill status="synced" />
        <StatusPill status="offline" />
      </div>
    </>
  );
}

export default function StyleguidePage() {
  const [theme, setTheme] = useState<ThemeMode>("auto");
  const [search, setSearch] = useState("Canon");
  const [format, setFormat] = useState<"pdf" | "xlsx" | "csv">("pdf");
  const [chip, setChip] = useState<string>("12.50");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [plainDialogOpen, setPlainDialogOpen] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "auto") {
      delete el.dataset.theme;
    } else {
      el.dataset.theme = theme;
    }
    return () => {
      delete el.dataset.theme;
    };
  }, [theme]);

  return (
    <main className="ds-sg">
      <div className="ds-sg-inner">
        <header>
          <h1 className="ds-sg-title">Design system</h1>
          <p className="ds-sg-lede">
            Every shared component in every state, styled only from tokens.css. Not linked in the
            app — open #/styleguide directly.
          </p>
        </header>

        <section className="ds-sg-section" aria-label="Theme">
          <SectionHeader>Theme</SectionHeader>
          <SegmentedControl
            label="Colour scheme"
            options={[
              { value: "auto", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </section>

        <section className="ds-sg-section" aria-label="Colours">
          <SectionHeader>Colour tokens</SectionHeader>
          <div className="ds-sg-swatches">
            {SWATCHES.map((swatch) => (
              <div className="ds-sg-swatch" key={swatch.varName}>
                <div
                  className="ds-sg-swatch-color"
                  style={{ background: `var(${swatch.varName})` }}
                />
                <div className="ds-sg-swatch-label">
                  <span className="ds-sg-swatch-name">{swatch.name}</span>
                  <span>
                    var({swatch.varName}){swatch.note ? ` · ${swatch.note}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-sg-section" aria-label="Typography">
          <SectionHeader>Typography</SectionHeader>
          <div className="ds-sg-type-display ds-num">155 301</div>
          <div className="ds-sg-type-title2">Day total 85 km</div>
          <div className="ds-sg-type-title3">Canon — 10851 Shellbridge Way</div>
          <p style={{ margin: 0, lineHeight: "var(--lh-body)" }}>
            Body text is 16 px in the system font, regular weight, with semibold reserved for
            emphasis and key numbers.
          </p>
          <span className="ds-sg-type-small">Small text, 14 px</span>
          <span className="ds-sg-type-caption">Caption, 12 px, muted</span>
        </section>

        <section className="ds-sg-section" aria-label="Buttons">
          <SectionHeader>Buttons</SectionHeader>
          <div className="ds-sg-stack">
            <Button>Save stop</Button>
            <Button variant="secondary">Review day</Button>
            <Button variant="destructive">Delete all data</Button>
            <div className="ds-sg-row">
              <Button variant="text">Cancel</Button>
              <Button loading>Saving…</Button>
            </div>
            <Button disabled>Disabled primary</Button>
            <Button variant="secondary" disabled>
              Disabled secondary
            </Button>
          </div>
        </section>

        <section className="ds-sg-section" aria-label="Fields">
          <SectionHeader>Fields</SectionHeader>
          <TextField
            label="Place name"
            placeholder="e.g. Canon"
            hint="As it should appear on the report."
          />
          <TextField
            label="Address"
            defaultValue="10851 Shellbridge Way"
            error="That address looks incomplete — add the city."
          />
          <NumericField
            label="Odometer end"
            placeholder="155 325"
            hint="Type the last digits — the rest is filled in."
          />
          <NumericField
            label="Odometer (large)"
            large
            defaultValue="155339"
            hint="Previous reading 155 325"
          />
          <SearchField
            label="Search for a place"
            placeholder="Start typing a name or address"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch("")}
          />
        </section>

        <section className="ds-sg-section" aria-label="Segmented control">
          <SectionHeader>Segmented control</SectionHeader>
          <SegmentedControl
            label="Report format"
            options={[
              { value: "pdf", label: "PDF" },
              { value: "xlsx", label: "Excel" },
              { value: "csv", label: "CSV" },
            ]}
            value={format}
            onChange={setFormat}
          />
        </section>

        <section className="ds-sg-section" aria-label="Cards and rows">
          <SectionHeader>Card & list rows</SectionHeader>
          <Card>
            <ListRow
              icon={<MapPinIcon />}
              title="Canon (Office)"
              subtitle="10851 Shellbridge Way, Richmond, BC"
              value="24 km"
              chevron
              onClick={() => undefined}
            />
            <ListRow
              icon={<CarIcon />}
              title="Dsk Law"
              subtitle="970-789 W Pender St, Vancouver, BC"
              value="14 km"
            />
            <ListRow
              icon={<CalendarIcon />}
              title="Thu, Oct 22, 2026"
              subtitle="5 stops"
              value="85 km"
              chevron
              onClick={() => undefined}
            />
          </Card>
        </section>

        <section className="ds-sg-section" aria-label="Pills badges chips">
          <SectionHeader>Pills, badges, chips</SectionHeader>
          <div className="ds-sg-row">
            <StatusPill status="synced" />
            <StatusPill status="pending" label="Pending · 3" />
            <StatusPill status="offline" />
          </div>
          <div className="ds-sg-row">
            <Badge>Parking $12.50</Badge>
            <Badge>Needs review</Badge>
          </div>
          <div className="ds-sg-row">
            {["5.00", "12.50", "20.00"].map((amount) => (
              <Chip key={amount} selected={chip === amount} onClick={() => setChip(amount)}>
                ${amount}
              </Chip>
            ))}
            <Chip>Free</Chip>
          </div>
        </section>

        <section className="ds-sg-section" aria-label="Banners and toast">
          <SectionHeader>Banners & toast</SectionHeader>
          <Banner kind="offline">
            You are offline. Changes are saved on this phone and will sync later.
          </Banner>
          <Banner kind="warning">
            This is 480 km more than last time between these places. Is that right?
          </Banner>
          <Toast
            message="Stop saved"
            actionLabel="Undo"
            onAction={() => undefined}
            icon={<CheckIcon width={18} height={18} />}
          />
          <Toast message="Day ended — nice work." />
        </section>

        <section className="ds-sg-section" aria-label="States">
          <SectionHeader>Loading, empty, error</SectionHeader>
          <SkeletonCard lines={3} />
          <div className="ds-sg-row">
            <Skeleton width={96} height={28} radius={999} />
            <Skeleton width={140} height={28} radius={999} />
          </div>
          <Card>
            <EmptyState
              icon={<GaugeIcon />}
              message="No day started yet. Your last day was Thu, Oct 22 — 85 km."
              action={<Button>Start day</Button>}
            />
          </Card>
          <Card>
            <ErrorState
              message="We could not load this day. Your logs are safe on this phone."
              onRetry={() => undefined}
            />
          </Card>
        </section>

        <section className="ds-sg-section" aria-label="Overlays">
          <SectionHeader>Sheet & dialog</SectionHeader>
          <div className="ds-sg-row">
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
            <Button variant="secondary" onClick={() => setPlainDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="destructive" onClick={() => setDialogOpen(true)}>
              Delete…
            </Button>
          </div>
        </section>

        <section className="ds-sg-section" aria-label="Icons">
          <SectionHeader>Icons — 24 px, 1.75 stroke</SectionHeader>
          <div className="ds-sg-icons">
            {ICONS.map(({ name, Icon }) => (
              <span className="ds-sg-icon" key={name}>
                <Icon />
                {name}
              </span>
            ))}
          </div>
        </section>

        <section className="ds-sg-section" aria-label="Both schemes">
          <SectionHeader>Both schemes, side by side</SectionHeader>
          <div className="ds-sg-panel" data-theme="light">
            <span className="ds-sg-panel-name">Light (forced)</span>
            <MiniSpecimen />
          </div>
          <div className="ds-sg-panel" data-theme="dark">
            <span className="ds-sg-panel-name">Dark (forced)</span>
            <MiniSpecimen />
          </div>
        </section>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Canon (Office)">
        <div className="ds-sg-stack">
          <p style={{ margin: 0, lineHeight: "var(--lh-body)" }}>
            10851 Shellbridge Way, Richmond, BC · 24 km from Home.
          </p>
          <Button>Edit stop</Button>
          <Button variant="text" onClick={() => setSheetOpen(false)}>
            Close
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={plainDialogOpen}
        title="End this day?"
        message="You can still edit today's stops afterwards from History."
        confirmLabel="End day"
        onConfirm={() => setPlainDialogOpen(false)}
        onCancel={() => setPlainDialogOpen(false)}
      />

      <ConfirmDialog
        open={dialogOpen}
        title="Delete this stop?"
        message="The odometer chain will be recalculated. You can undo this from the toast."
        confirmLabel="Delete stop"
        destructive
        onConfirm={() => setDialogOpen(false)}
        onCancel={() => setDialogOpen(false)}
      />
    </main>
  );
}
