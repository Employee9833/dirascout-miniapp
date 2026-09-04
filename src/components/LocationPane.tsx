import StepNameCity from "./StepNameCity";
import StepDistricts from "./StepDistricts";
import { useWizardStore } from "../store/wizardStore";
import { getLang } from "../lib/telegram";

// City and districts are ONE question to a user ("where am I looking?"),
// even though they are two fields and two pickers. The hub shows them on a
// single "Локация" row, so they share a single pane -- picking a city and
// then not seeing its districts on the same screen was the main thing that
// made the old four-step wizard feel like paperwork.
//
// Both halves are the original wizard components, each narrowed by its own
// `only` prop. The district picker is deliberately hidden until a city is
// chosen: its list is per-city (CITIES[city].districts) and reads as
// "no districts exist" when there is no city yet, rather than as
// "pick a city first".
export default function LocationPane() {
  const lang = getLang();
  const city = useWizardStore((s) => s.city);

  const hint =
    lang === "he"
      ? "בחרו עיר כדי לראות שכונות"
      : lang === "en"
      ? "Pick a city to see its districts"
      : "Выберите город, чтобы увидеть районы";

  return (
    <div className="space-y-6">
      <StepNameCity only="city" />
      {city ? (
        <StepDistricts />
      ) : (
        <p className="px-1 text-[13px] text-muted">{hint}</p>
      )}
    </div>
  );
}
