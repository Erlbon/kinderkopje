/**
 * Countries by the codes UCI uses (the IOC three-letter codes: GER, NED, SUI, DEN ...), with their continent and UCI
 * confederation, so races, riders and teams can be filtered by continent. Armenia, Azerbaijan, Cyprus, Georgia, Israel and
 * Türkiye belong to UCI's European confederation, Kazakhstan to the Asian one, and the Caribbean and Central America are
 * counted as North America.
 */

export type Continent = "Europe" | "Asia" | "Africa" | "North America" | "South America" | "Oceania";

export const CONTINENTS: Continent[] = ["Europe", "Asia", "Africa", "North America", "South America", "Oceania"];

export interface Country {
  code: string;
  name: string;
  continent: Continent;
  confederation: "Europe" | "Asia" | "Africa" | "Pan America" | "Oceania";
}

const E = "Europe", A = "Asia", F = "Africa", N = "North America", S = "South America", O = "Oceania";

// code, name, continent
const RAW: [string, string, Continent][] = [
  ["ALB", "Albania", E], ["AND", "Andorra", E], ["ARM", "Armenia", E], ["AUT", "Austria", E], ["AZE", "Azerbaijan", E], ["BEL", "Belgium", E],
  ["BIH", "Bosnia and Herzegovina", E], ["BLR", "Belarus", E], ["BUL", "Bulgaria", E], ["CRO", "Croatia", E], ["CYP", "Cyprus", E], ["CZE", "Czechia", E],
  ["DEN", "Denmark", E], ["ESP", "Spain", E], ["EST", "Estonia", E], ["FIN", "Finland", E], ["FRA", "France", E], ["GBR", "Great Britain", E],
  ["GEO", "Georgia", E], ["GER", "Germany", E], ["GRE", "Greece", E], ["HUN", "Hungary", E], ["IRL", "Ireland", E], ["ISL", "Iceland", E],
  ["ISR", "Israel", E], ["ITA", "Italy", E], ["KOS", "Kosovo", E], ["LAT", "Latvia", E], ["LTU", "Lithuania", E], ["LUX", "Luxembourg", E],
  ["MDA", "Moldova", E], ["MKD", "North Macedonia", E], ["MLT", "Malta", E], ["MNE", "Montenegro", E], ["MON", "Monaco", E], ["NED", "Netherlands", E],
  ["NOR", "Norway", E], ["POL", "Poland", E], ["POR", "Portugal", E], ["ROU", "Romania", E], ["RUS", "Russia", E], ["SLO", "Slovenia", E],
  ["SRB", "Serbia", E], ["SUI", "Switzerland", E], ["SVK", "Slovakia", E], ["SWE", "Sweden", E], ["TUR", "Türkiye", E], ["UKR", "Ukraine", E],
  ["AFG", "Afghanistan", A], ["BRN", "Bahrain", A], ["CAM", "Cambodia", A], ["CHN", "China", A], ["HKG", "Hong Kong", A], ["INA", "Indonesia", A],
  ["IND", "India", A], ["IRI", "Iran", A], ["JOR", "Jordan", A], ["JPN", "Japan", A], ["KAZ", "Kazakhstan", A], ["KGZ", "Kyrgyzstan", A],
  ["KOR", "South Korea", A], ["KSA", "Saudi Arabia", A], ["LAO", "Laos", A], ["LBN", "Lebanon", A], ["MAC", "Macau", A], ["MAS", "Malaysia", A],
  ["MGL", "Mongolia", A], ["OMA", "Oman", A], ["PAK", "Pakistan", A], ["PHI", "Philippines", A], ["QAT", "Qatar", A], ["SIN", "Singapore", A],
  ["SYR", "Syria", A], ["THA", "Thailand", A], ["TJK", "Tajikistan", A], ["TPE", "Chinese Taipei", A], ["UAE", "United Arab Emirates", A],
  ["UZB", "Uzbekistan", A], ["VIE", "Vietnam", A],
  ["ALG", "Algeria", F], ["ANG", "Angola", F], ["BDI", "Burundi", F], ["BEN", "Benin", F], ["BUR", "Burkina Faso", F], ["CIV", "Côte d'Ivoire", F],
  ["CMR", "Cameroon", F], ["COD", "DR Congo", F], ["CPV", "Cabo Verde", F], ["EGY", "Egypt", F], ["ERI", "Eritrea", F], ["ETH", "Ethiopia", F],
  ["GAB", "Gabon", F], ["GBS", "Guinea-Bissau", F], ["GHA", "Ghana", F], ["KEN", "Kenya", F], ["LES", "Lesotho", F], ["MAR", "Morocco", F],
  ["MLI", "Mali", F], ["MRI", "Mauritius", F], ["MTN", "Mauritania", F], ["NAM", "Namibia", F], ["NGR", "Nigeria", F], ["RSA", "South Africa", F],
  ["RWA", "Rwanda", F], ["SEN", "Senegal", F], ["SWZ", "Eswatini", F], ["TUN", "Tunisia", F], ["UGA", "Uganda", F], ["ZIM", "Zimbabwe", F],
  ["ANT", "Antigua and Barbuda", N], ["BAR", "Barbados", N], ["BER", "Bermuda", N], ["BIZ", "Belize", N], ["CAN", "Canada", N], ["CAY", "Cayman Islands", N],
  ["CRC", "Costa Rica", N], ["CUB", "Cuba", N], ["CUR", "Curaçao", N], ["DMA", "Dominica", N], ["DOM", "Dominican Republic", N], ["ESA", "El Salvador", N],
  ["GRN", "Grenada", N], ["GUA", "Guatemala", N], ["HON", "Honduras", N], ["IVB", "British Virgin Islands", N], ["JAM", "Jamaica", N], ["LCA", "Saint Lucia", N],
  ["MEX", "Mexico", N], ["NCA", "Nicaragua", N], ["PAN", "Panama", N], ["PUR", "Puerto Rico", N], ["SXM", "Sint Maarten", N], ["TTO", "Trinidad and Tobago", N],
  ["USA", "United States", N], ["VIN", "Saint Vincent and the Grenadines", N],
  ["ARG", "Argentina", S], ["BOL", "Bolivia", S], ["BRA", "Brazil", S], ["CHI", "Chile", S], ["COL", "Colombia", S], ["ECU", "Ecuador", S],
  ["GUY", "Guyana", S], ["PAR", "Paraguay", S], ["PER", "Peru", S], ["SUR", "Suriname", S], ["URU", "Uruguay", S], ["VEN", "Venezuela", S],
  ["AUS", "Australia", O], ["GUM", "Guam", O], ["NZL", "New Zealand", O],
];

const CONFEDERATION: Record<Continent, Country["confederation"]> = {
  Europe: "Europe",
  Asia: "Asia",
  Africa: "Africa",
  "North America": "Pan America",
  "South America": "Pan America",
  Oceania: "Oceania",
};

export const COUNTRIES: Country[] = RAW.map(([code, name, continent]) => ({ code, name, continent, confederation: CONFEDERATION[continent] })).sort((a, b) => a.code.localeCompare(b.code));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** The country for a UCI code, if the table knows it. */
export function countryOf(code: string | null | undefined): Country | undefined {
  return BY_CODE.get((code ?? "").trim().toUpperCase());
}

/** The continent of a UCI country code, or nothing for a code that is not in the table. */
export function continentOf(code: string | null | undefined): Continent | undefined {
  return countryOf(code)?.continent;
}
