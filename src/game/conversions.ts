/**
 * Illustrative real-world conversions for the end-of-run summary.
 * Figures are rounded industry averages, good enough to build intuition.
 */
export const CONVERSIONS = {
  /** kg CO2 avoided per kWh of solar vs. average US grid mix (EPA ~0.39). */
  co2PerKwh: 0.39,
  /** Rough US residential retail electricity price ($/kWh). */
  dollarsPerKwh: 0.16,
  /** Energy to fully charge a typical smartphone (~19 Wh). */
  kwhPerPhoneCharge: 0.019,
  /** Average US home daily use ~30 kWh => ~1.25 kW continuous. */
  homeKw: 1.25,
};

export function summarize(energyKwh: number) {
  return {
    co2Kg: energyKwh * CONVERSIONS.co2PerKwh,
    dollars: energyKwh * CONVERSIONS.dollarsPerKwh,
    phoneCharges: energyKwh / CONVERSIONS.kwhPerPhoneCharge,
    homeHours: energyKwh / CONVERSIONS.homeKw,
  };
}
