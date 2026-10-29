import React from "react";

import { BookingTable } from "./Bookings";
import { ErrorBox, Loading, money, Stat, useApi, useRoute } from "./lib";
import type { BookingRow, Wallet } from "./types";

type Dash = {
  captains: { total: number; live: number; pending_kyc: number };
  invites_pending: number;
  trips_listed: number;
  requests: BookingRow[];
  requests_count: number;
  upcoming: BookingRow[];
  upcoming_count: number;
  wallet: Wallet;
};

export default function Home() {
  const [, go] = useRoute();
  const d = useApi<Dash>("/agency/dashboard/", undefined, 30000);
  if (d.error) return <ErrorBox error={d.error} retry={d.reload} />;
  if (!d.data) return <Loading />;
  const x = d.data;
  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Today</div><h1>Your agency</h1></div></div>
      {!x.trips_listed ? <div className="notice warn">List your first trip under Trips &amp; prices: your Captains can't be booked without one.</div> : null}
      {!x.captains.total ? <div className="notice info">Invite your Captains from the Captains page. They sign up in the GoLoc Captain app and accept your invite.</div> : null}
      <div className="stats">
        <Stat label="Requests to answer" value={x.requests_count} tone={x.requests_count ? "bad" : undefined} onClick={() => go("/bookings")} />
        <Stat label="Upcoming trips" value={x.upcoming_count} onClick={() => go("/bookings")} />
        <Stat label="Captains live" value={`${x.captains.live} / ${x.captains.total}`} hint={x.captains.pending_kyc ? `${x.captains.pending_kyc} awaiting GoLoc KYC` : undefined} onClick={() => go("/captains")} />
        <Stat label="Wallet" value={money(x.wallet.available)} hint="Ready to withdraw" onClick={() => go("/money")} />
        <Stat label="Earned this month" value={money(x.wallet.this_month)} onClick={() => go("/money")} />
        <Stat label="Coming from booked trips" value={money(x.wallet.pending_trips)} hint="Credited when each trip completes" />
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Requests to answer</h3><a className="small" href="#/bookings">All →</a></div>
          <BookingTable rows={x.requests} empty="No open requests." />
        </div>
        <div className="card">
          <div className="card-head"><h3>Upcoming trips</h3><a className="small" href="#/bookings">All →</a></div>
          <BookingTable rows={x.upcoming} empty="Nothing booked yet." />
        </div>
      </div>
    </div>
  );
}
