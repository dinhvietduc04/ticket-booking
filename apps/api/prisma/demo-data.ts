import type { EventCategory, EventStatus } from "@prisma/client";

export const organizations = [
  {
    slug: "seatly-demo-live",
    name: "Saigon Live Collective",
    description:
      "Independent concerts, intimate jazz nights, and live performance across Vietnam.",
  },
  {
    slug: "seatly-demo-culture",
    name: "Lantern Arts & Cinema",
    description: "Stories on screen and stage, curated for curious audiences.",
  },
  {
    slug: "seatly-demo-community",
    name: "Next Wave Experiences",
    description:
      "Bringing sports fans, makers, and creative communities together.",
  },
];

export const venues = [
  {
    key: "river",
    organization: 0,
    name: "Riverfront Music Hall",
    address: "18 Nguyen Huu Canh, Binh Thanh",
    city: "Ho Chi Minh City",
    hall: "River Stage",
    rows: 8,
    columns: 12,
  },
  {
    key: "jazz",
    organization: 0,
    name: "Old Quarter Listening Room",
    address: "24 Hang Bac, Hoan Kiem",
    city: "Hanoi",
    hall: "The Listening Room",
    rows: 5,
    columns: 8,
  },
  {
    key: "cinema",
    organization: 1,
    name: "Lantern Cinema House",
    address: "42 Nguyen Hue, District 1",
    city: "Ho Chi Minh City",
    hall: "Screen One",
    rows: 6,
    columns: 10,
  },
  {
    key: "theater",
    organization: 1,
    name: "Lotus Performing Arts Center",
    address: "16 Trang Tien, Hoan Kiem",
    city: "Hanoi",
    hall: "Lotus Auditorium",
    rows: 7,
    columns: 10,
  },
  {
    key: "coast",
    organization: 2,
    name: "Coastal Convention & Sports Center",
    address: "88 Vo Nguyen Giap, Son Tra",
    city: "Da Nang",
    hall: "Ocean Hall",
    rows: 8,
    columns: 12,
  },
] as const;

export type DemoEvent = {
  slug: string;
  title: string;
  category: EventCategory;
  venue: (typeof venues)[number]["key"];
  image: string;
  description: string;
  days: number[];
  price: number;
  status?: EventStatus;
  scenario?:
    "queue" | "popular" | "sold-out" | "partial-refund" | "closed-refund";
};

// Fictional productions and venues; stock images are not official event posters.
export const events: DemoEvent[] = [
  {
    slug: "neon-river-festival",
    title: "Neon River Music Festival",
    category: "CONCERT",
    venue: "river",
    image: "festival",
    days: [14, 15],
    price: 650000,
    scenario: "queue",
    description:
      "An evening of indie pop, electronic sets, and a closing light show beside the Saigon river. Doors open at 18:00; the three-hour program includes two intervals. Reserved seating, step-free access, and food vendors are available. Recommended for ages 16 and up.",
  },
  {
    slug: "hanoi-after-dark-jazz",
    title: "Hanoi After Dark: Jazz Sessions",
    category: "CONCERT",
    venue: "jazz",
    image: "jazz",
    days: [7, 8],
    price: 350000,
    description:
      "A piano trio meets a soulful guest vocalist for an intimate night of jazz standards and new arrangements. Arrive 30 minutes early for seating. The performance runs for two hours with one interval; drinks are sold separately.",
  },
  {
    slug: "acoustic-sunset",
    title: "Acoustic Sunset: Stories & Strings",
    category: "CONCERT",
    venue: "river",
    image: "acoustic",
    days: [21],
    price: 280000,
    description:
      "Three independent songwriters share acoustic sets and the stories behind their music. Expect warm harmonies, guitar-led arrangements, and an audience request segment. A relaxed, seated performance for ages 12 and up; doors open one hour before the show.",
  },
  {
    slug: "starlight-cinema",
    title: "Starlight Cinema: Beyond the Horizon",
    category: "MOVIE",
    venue: "cinema",
    image: "cinema",
    days: [4, 5, 6],
    price: 95000,
    description:
      "A fictional science-fiction feature about a small crew searching for a new home among the stars. Presented with Vietnamese and English subtitles, followed by a discussion with the curator. Runtime: 125 minutes. Recommended for ages 13 and up; concessions are available in the lobby.",
  },
  {
    slug: "animation-weekend",
    title: "Family Animation Weekend",
    category: "MOVIE",
    venue: "cinema",
    image: "animation",
    days: [11, 12],
    price: 75000,
    description:
      "A colorful collection of animated adventures celebrating friendship and imagination. The 90-minute program is suitable for families and includes a short intermission. Every attendee needs a reserved seat; accessible seating is available in the rear row.",
  },
  {
    slug: "documentary-club",
    title: "Documentary Club: A Living Planet",
    category: "MOVIE",
    venue: "cinema",
    image: "nature",
    days: [18],
    price: 85000,
    description:
      "Discover landscapes and the communities protecting them in this curated nature documentary evening. The screening is followed by a moderated audience conversation. English audio with Vietnamese subtitles; total program time is two hours. Please arrive 20 minutes early.",
  },
  {
    slug: "city-hoops",
    title: "City Hoops: Coastal Cup Final",
    category: "SPORT",
    venue: "coast",
    image: "basketball",
    days: [9],
    price: 180000,
    scenario: "popular",
    description:
      "Two community basketball teams compete in the Coastal Cup final, with a halftime skills challenge and live courtside commentary. Reserved seating includes premium front-row views and accessible places. Gates open one hour before tip-off; children under 12 must attend with an adult.",
  },
  {
    slug: "weekend-futsal",
    title: "Weekend Futsal Invitational",
    category: "SPORT",
    venue: "coast",
    image: "football",
    days: [16, 17],
    price: 120000,
    description:
      "Fast-paced indoor football featuring local club teams in two evening showcase matches. Each ticket covers one session, including warm-ups and the full match. Team colors are welcome; outside food and glass containers are not permitted. Gates open 45 minutes before kickoff.",
  },
  {
    slug: "midnight-in-saigon",
    title: "Midnight in Saigon",
    category: "THEATER",
    venue: "theater",
    image: "theater",
    days: [10, 13],
    price: 320000,
    scenario: "sold-out",
    description:
      "An original stage drama following four strangers whose paths cross during a sudden summer rainstorm. Performed in Vietnamese with English surtitles. Running time is two hours including an interval. Evening dress is optional; late arrivals are seated at the next suitable break.",
  },
  {
    slug: "little-lanterns",
    title: "Little Lanterns: A Family Show",
    category: "THEATER",
    venue: "theater",
    image: "lanterns",
    days: [2],
    price: 160000,
    scenario: "partial-refund",
    description:
      "Puppetry, live music, and gentle humor bring a lantern maker's adventure to life. Designed for families with children aged five and above. The 70-minute performance has no interval, with a short meet-the-puppets session afterward. Doors open 30 minutes before the show.",
  },
  {
    slug: "builders-summit",
    title: "Vietnam Builders Summit",
    category: "CONFERENCE",
    venue: "coast",
    image: "conference",
    days: [23, 24],
    price: 490000,
    description:
      "An evening summit for product builders, designers, and engineers, with practical talks, live demonstrations, and facilitated networking. Each session includes three talks and a panel. Bring your ticket for check-in; refreshments and a digital session guide are included.",
  },
  {
    slug: "design-tomorrow",
    title: "Design Tomorrow: Creative Forum",
    category: "CONFERENCE",
    venue: "coast",
    image: "design",
    days: [0],
    price: 250000,
    scenario: "closed-refund",
    description:
      "A focused evening of conversations about accessible products, visual storytelling, and sustainable design. Meet local creative teams through short talks and a moderated critique session. Suitable for students and working designers; doors open one hour before the program.",
  },
  {
    slug: "winter-sessions-preview",
    title: "Winter Sessions: First Look",
    category: "CONCERT",
    venue: "jazz",
    image: "jazz",
    days: [45],
    price: 420000,
    status: "DRAFT",
    description:
      "An upcoming series of intimate performances pairing emerging vocalists with the resident house band. The production team is finalizing the running order and guest lineup before tickets go on sale.",
  },
  {
    slug: "rainy-season-live",
    title: "Rainy Season Live",
    category: "CONCERT",
    venue: "river",
    image: "festival",
    days: [6],
    price: 450000,
    status: "CANCELLED",
    description:
      "This live show has been cancelled after a production safety review. All ticket holders have received a full refund through their original demo payment method. Customer notifications and refund records remain available in booking history.",
  },
  {
    slug: "summer-encore",
    title: "Summer Encore: The Closing Night",
    category: "THEATER",
    venue: "theater",
    image: "theater",
    days: [-7],
    price: 220000,
    status: "COMPLETED",
    description:
      "The closing performance of our summer repertory season brought together music, spoken word, and contemporary dance. This archived production includes completed attendance and sales records for the organizing team.",
  },
];
