"use client";

import React from "react";
import { useRouter } from "next/navigation";

/**
 * Nomoosh Landing Page (Premium UI)
 * - Brand color: #1c37b3
 * - Matches provided mock design
 * - Join as Restaurant => /res_details
 */

const BRAND = "#1c37b3";

export default function LandingPage() {
  const router = useRouter();

  const goJoinRestaurant = () => router.push("/onboard/res_details");

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#fbfaf8] text-slate-900">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* logo */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => scrollTo("top")}
          >
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-extrabold shadow-sm"
              style={{ background: BRAND }}
            >
              N
            </div>
            <div className="text-2xl font-extrabold tracking-tight text-[#1c37b3]">
              Nomoosh
            </div>
          </div>

          {/* nav links */}
          <nav className="hidden md:flex items-center gap-10 text-sm text-slate-600">
            <button onClick={() => scrollTo("how")} className="hover:text-slate-900">
              How it works
            </button>
            <button
              onClick={() => scrollTo("features")}
              className="hover:text-slate-900"
            >
              Features
            </button>
            <button
              onClick={() => scrollTo("restaurants")}
              className="hover:text-slate-900"
            >
              Find Restaurants
            </button>
            <button
              onClick={() => scrollTo("contact")}
              className="hover:text-slate-900"
            >
              Contact
            </button>
          </nav>

          {/* CTA */}
          <button
            onClick={goJoinRestaurant}
            className="px-5 py-2 rounded-xl text-white font-semibold shadow-md hover:opacity-95 transition"
            style={{ background: BRAND }}
          >
            Join as Restaurant
          </button>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-16 grid lg:grid-cols-2 gap-12 items-center">
          {/* left */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 text-sm text-[#1c37b3] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#1c37b3]" />
              Now live in 50+ cities
            </div>

            <h1 className="mt-8 text-[52px] leading-[1.05] font-extrabold tracking-tight">
              <span className="font-serif font-semibold text-slate-900">
                Menus that live{" "}
              </span>
              <span className="font-serif font-semibold text-[#1c37b3]">
                on your table.
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-600 max-w-xl">
              Let customers scan a QR code, browse your menu, and order directly
              from their phone — no apps, no waiting, no confusion.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button
                onClick={goJoinRestaurant}
                className="px-7 py-4 rounded-full text-white font-semibold shadow-lg hover:opacity-95 transition flex items-center gap-3"
                style={{ background: BRAND }}
              >
                Join as Restaurant{" "}
                <span className="text-xl translate-y-[1px]">→</span>
              </button>

              <button
                onClick={() => scrollTo("how")}
                className="px-7 py-4 rounded-full bg-white border border-slate-200 text-slate-800 font-semibold shadow-sm hover:bg-slate-50 transition"
              >
                See how it works
              </button>
            </div>

            {/* stats */}
            <div className="mt-14 grid grid-cols-3 gap-10 max-w-lg">
              <Stat value="500+" label="Restaurants" />
              <Stat value="2M+" label="Orders Placed" />
              <Stat value="4.9" label="Rating" />
            </div>
          </div>

          {/* right */}
          <div className="relative flex justify-center lg:justify-end">
            {/* phone mock */}
            <div className="relative w-[360px] h-[540px] rounded-[40px] bg-gradient-to-b from-slate-50 to-white shadow-2xl border border-slate-200 overflow-hidden">
              {/* top notch */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-6 bg-slate-900 rounded-full opacity-80" />
              {/* content */}
              <div className="pt-16 px-8">
                <div className="w-16 h-16 rounded-2xl bg-[#e9ecff] flex items-center justify-center mx-auto">
                  <span className="text-2xl">🍽️</span>
                </div>

                <h3 className="mt-7 text-center font-serif text-2xl font-bold">
                  The Grand Kitchen
                </h3>
                <p className="text-center text-sm text-slate-500 mt-1">
                  Table 12 · Fine Dining
                </p>

                <div className="mt-8 space-y-4">
                  <MenuRow title="Truffle Risotto" badge="Chef's Special" price="₹850" />
                  <MenuRow title="Grilled Salmon" badge="Popular" price="₹1200" />
                  <MenuRow title="Tiramisu" badge="" price="₹450" />
                </div>

                <button
                  className="mt-8 w-full py-4 rounded-2xl text-white font-semibold shadow-lg"
                  style={{ background: BRAND }}
                >
                  Add to Order
                </button>

                <div className="mt-6 flex justify-end">
                  <div className="bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-2xl flex items-center gap-2">
                    📱 <span className="text-sm font-medium text-slate-700">Scan & Order</span>
                  </div>
                </div>
              </div>
            </div>

            {/* floating QR */}
            <div className="absolute left-0 lg:left-14 top-36 bg-white rounded-2xl border border-slate-200 shadow-lg p-4">
              <div className="text-[#1c37b3] text-3xl">▦</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-center font-serif text-5xl font-semibold text-slate-900">
            How Nomoosh works
          </h2>
          <p className="text-center text-slate-600 mt-4 text-lg">
            Get started in minutes. Transform your restaurant with digital ordering.
          </p>

          <div className="mt-16 grid md:grid-cols-3 gap-8">
            <StepCard
              step="01"
              title="Place QR on table"
              desc="A unique QR code for every table in your restaurant. Easy to set up, instant to deploy."
              icon="▦"
            />
            <StepCard
              step="02"
              title="Customers scan & order"
              desc="They view your beautiful menu and place orders instantly from their phone. No app needed."
              icon="📱"
            />
            <StepCard
              step="03"
              title="Kitchen receives orders"
              desc="Orders go straight to your kitchen system in real time. Seamless integration."
              icon="🍽️"
            />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-28 bg-[#f7f6f2]">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-14 items-start">
          {/* left */}
          <div>
            <h2 className="font-serif text-6xl leading-[1.05] font-semibold">
              Why restaurants choose{" "}
              <span className="text-[#1c37b3]">Nomoosh</span>
            </h2>
            <p className="mt-6 text-lg text-slate-600 max-w-xl">
              Join hundreds of restaurants that have modernized their ordering
              experience. From fine dining to quick service, Nomoosh works for everyone.
            </p>

            <ul className="mt-10 space-y-5 text-slate-700">
              <FeatureBullet text="Setup in under 5 minutes" />
              <FeatureBullet text="No monthly fees for basic features" />
              <FeatureBullet text="24/7 customer support" />
              <FeatureBullet text="Free QR code materials" />
            </ul>
          </div>

          {/* right grid */}
          <div className="grid sm:grid-cols-2 gap-6">
            <FeatureCard
              title="No app download required"
              desc="Customers simply scan and go. Works on any smartphone browser."
              icon="⬇️"
            />
            <FeatureCard
              title="Update menu anytime"
              desc="Change prices, add specials, remove items instantly. No reprinting."
              icon="🔁"
            />
            <FeatureCard
              title="Faster table turnover"
              desc="Reduce wait times and serve more customers during peak hours."
              icon="⏱️"
            />
            <FeatureCard
              title="Works on any smartphone"
              desc="iOS, Android, any browser. No compatibility issues ever."
              icon="📱"
            />
            <FeatureCard
              title="Reduces staff workload"
              desc="Let your team focus on hospitality, not taking orders."
              icon="👥"
            />
            <FeatureCard
              title="Clean, modern experience"
              desc="Impress guests with a beautiful, branded digital menu."
              icon="✨"
            />
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-center font-serif text-6xl font-semibold">
            Loved by restaurants
          </h2>
          <p className="text-center text-slate-600 mt-4 text-lg">
            See what restaurant owners and managers are saying about Nomoosh.
          </p>

          <div className="mt-16 grid md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="Nomoosh transformed our restaurant. Orders are faster, accurate, and our staff can focus on what matters — great hospitality."
              name="Priya Sharma"
              role="Owner, Spice Garden"
            />
            <TestimonialCard
              quote="The setup took 5 minutes. Our customers love scanning and ordering from their phones. It feels so modern!"
              name="Arjun Mehta"
              role="Manager, Urban Bites"
            />
            <TestimonialCard
              quote="I update my menu daily with fresh specials. With Nomoosh, changes reflect instantly — no printing costs."
              name="Neha Kapoor"
              role="Chef & Owner, Flavours"
            />
          </div>
        </div>
      </section>

      {/* FIND RESTAURANTS */}
      <section id="restaurants" className="py-28 bg-[#fbfaf8] border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-center font-serif text-6xl font-semibold">
            Find nearby restaurants
          </h2>
          <p className="text-center text-slate-600 mt-4 text-lg">
            Discover restaurants near you that use Nomoosh for seamless digital ordering.
          </p>

          {/* search */}
          <div className="mt-14 flex flex-col md:flex-row gap-4 items-center justify-center">
            <div className="w-full md:w-[520px] bg-white border border-slate-200 rounded-2xl px-4 py-4 flex items-center gap-3 shadow-sm">
              <span className="text-slate-400 text-xl">🔍</span>
              <input
                placeholder="Search by restaurant name or cuisine..."
                className="w-full outline-none text-slate-700"
              />
            </div>

            <button
              className="px-8 py-4 rounded-2xl font-semibold text-white shadow-lg hover:opacity-95 transition w-full md:w-auto"
              style={{ background: BRAND }}
            >
              📍 Near Me
            </button>
          </div>

          {/* cards */}
          <div className="mt-16 grid md:grid-cols-4 gap-6">
            <RestaurantCard
              title="The Grand Kitchen"
              rating="4.8"
              meta="Fine Dining · Continental"
              distance="0.5 km"
              time="12:00 PM - 11:00 PM"
              active={false}
            />
            <RestaurantCard
              title="Spice Symphony"
              rating="4.6"
              meta="Indian · North Indian"
              distance="1.2 km"
              time="11:00 AM - 10:30 PM"
              active={true}
            />
            <RestaurantCard
              title="Sakura Japanese"
              rating="4.9"
              meta="Japanese · Sushi"
              distance="2.0 km"
              time="12:30 PM - 10:00 PM"
              active={false}
            />
            <RestaurantCard
              title="La Bella Italia"
              rating="4.7"
              meta="Italian · Pizza & Pasta"
              distance="1.8 km"
              time="11:30 AM - 11:30 PM"
              active={false}
            />
          </div>

          <div className="mt-12 flex justify-center">
            <button className="px-7 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition font-semibold">
              🍽️ View All Restaurants
            </button>
          </div>
        </div>
      </section>

      {/* BIG CTA */}
      <section className="py-28">
        <div
          className="max-w-7xl mx-auto px-6 rounded-3xl py-24 text-center text-white shadow-2xl"
          style={{ background: BRAND }}
        >
          <div className="inline-flex px-5 py-2 rounded-full bg-white/10 text-white border border-white/15 shadow-sm">
            ✨ Limited time: First 3 months free
          </div>

          <h2 className="mt-8 font-serif text-6xl font-semibold">
            Turn every table into a smart table.
          </h2>

          <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
            Start accepting QR-based orders in minutes. No hardware required, no complex setup.
            Just scan and go.
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={goJoinRestaurant}
              className="px-8 py-4 rounded-full bg-white text-[#1c37b3] font-semibold shadow-lg hover:opacity-95 transition flex items-center gap-3"
            >
              Join as Restaurant <span className="text-xl">→</span>
            </button>

            <button className="px-8 py-4 rounded-full border border-white/30 bg-white/10 text-white font-semibold hover:bg-white/15 transition">
              Schedule a Demo
            </button>
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-10 text-white/80 text-sm">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 bg-emerald-400 rounded-full" /> No credit card required
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 bg-emerald-400 rounded-full" /> Setup in 5 minutes
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 bg-emerald-400 rounded-full" /> Cancel anytime
            </span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer
        id="contact"
        className="bg-[#161a22] text-white border-t border-white/10"
      >
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-12">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-extrabold"
                style={{ background: BRAND }}
              >
                N
              </div>
              <div className="text-xl font-extrabold">Nomoosh</div>
            </div>
            <p className="mt-4 text-sm text-white/70 max-w-xs">
              QR-based dining that lets customers scan, browse and order in seconds.
            </p>
          </div>

          <FooterCol title="Product" items={["Features", "Pricing", "How it works", "Integrations"]} />
          <FooterCol title="Company" items={["About Us", "Careers", "Contact", "Blog"]} />
          <FooterCol title="Support" items={["Help Center", "Documentation", "Privacy", "Terms"]} />
        </div>

        <div className="border-t border-white/10 py-6 text-center text-xs text-white/60">
          © {new Date().getFullYear()} Nomoosh. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

/* -------------------- Components -------------------- */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-4xl font-extrabold text-[#1c37b3]">{value}</div>
      <div className="text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function MenuRow({
  title,
  badge,
  price,
}: {
  title: string;
  badge?: string;
  price: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center justify-between shadow-sm">
      <div>
        <div className="font-semibold text-slate-900">{title}</div>
        {badge ? (
          <div className="mt-2 inline-flex px-3 py-1 rounded-full bg-[#eef0ff] text-[#1c37b3] text-xs font-medium">
            {badge}
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-400">—</div>
        )}
      </div>
      <div className="font-bold text-[#1c37b3]">{price}</div>
    </div>
  );
}

function StepCard({
  step,
  title,
  desc,
  icon,
}: {
  step: string;
  title: string;
  desc: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 relative overflow-hidden">
      <div className="absolute right-6 top-6 text-7xl font-extrabold text-slate-100">
        {step}
      </div>
      <div className="h-14 w-14 rounded-2xl bg-[#eef0ff] text-[#1c37b3] flex items-center justify-center text-2xl">
        {icon}
      </div>
      <h3 className="mt-6 font-serif text-2xl font-bold">{title}</h3>
      <p className="mt-4 text-slate-600 leading-relaxed">{desc}</p>
    </div>
  );
}

function FeatureBullet({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-4 text-lg">
      <div className="h-9 w-9 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-[#1c37b3] font-bold">
        ✓
      </div>
      {text}
    </li>
  );
}

function FeatureCard({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7">
      <div className="h-14 w-14 rounded-2xl bg-[#eef0ff] text-[#1c37b3] flex items-center justify-center text-2xl">
        {icon}
      </div>
      <h4 className="mt-6 font-serif text-xl font-bold">{title}</h4>
      <p className="mt-3 text-slate-600">{desc}</p>
    </div>
  );
}

function TestimonialCard({
  quote,
  name,
  role,
}: {
  quote: string;
  name: string;
  role: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 relative">
      <div className="absolute right-6 top-6 text-4xl text-[#e9ecff] font-extrabold">
        “”
      </div>

      <div className="flex gap-1 text-yellow-500 text-lg">
        ★★★★★
      </div>

      <p className="mt-6 text-slate-700 leading-relaxed">"{quote}"</p>

      <div className="mt-10 flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-[#eef0ff] border border-slate-200 flex items-center justify-center">
          👨‍🍳
        </div>
        <div>
          <div className="font-semibold">{name}</div>
          <div className="text-sm text-slate-500">{role}</div>
        </div>
      </div>
    </div>
  );
}

function RestaurantCard({
  title,
  rating,
  meta,
  distance,
  time,
  active,
}: {
  title: string;
  rating: string;
  meta: string;
  distance: string;
  time: string;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border shadow-sm overflow-hidden bg-white ${
        active ? "border-[#1c37b3]" : "border-slate-200"
      }`}
    >
      <div className="h-36 bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center text-4xl">
        🍽️
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-xl font-bold">{title}</h3>
          <div className="flex items-center gap-2 text-sm">
            ⭐ <span className="font-semibold">{rating}</span>
          </div>
        </div>

        <p className="text-slate-500 mt-2 text-sm">{meta}</p>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>📍 {distance}</span>
          <span>🕒 {time}</span>
        </div>
      </div>
    </div>
  );
}

function FooterCol({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="font-semibold mb-4">{title}</div>
      <ul className="space-y-2 text-sm text-white/70">
        {items.map((t) => (
          <li key={t} className="hover:text-white transition cursor-pointer">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
