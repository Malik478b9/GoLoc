import React, { useState } from "react";

import { post } from "../api/client";
import { ago, Badge, Empty, ErrorBox, Loading, Page, Pager, useAction, useApi } from "./lib";

type Post = { id: string; kind: string; media: string; thumbnail: string | null; caption: string; status: string; moderation_note: string; captain_code: string; captain_name: string; like_count: number; view_count: number; created_at: string };
type Review = { id: number; rating: number; comment: string; captain_reply: string; is_hidden: boolean; hidden_reason: string; captain_code: string; traveler_name: string; booking_code: string; created_at: string };

export function Moderation() {
  const [tab, setTab] = useState<"posts" | "reviews">("posts");
  const [page, setPage] = useState(1);
  const [low, setLow] = useState(false);
  const posts = useApi<Page<Post>>(tab === "posts" ? "/admin/posts/" : null, { page });
  const reviews = useApi<Page<Review>>(tab === "reviews" ? "/admin/reviews/" : null, { page, low: low ? 1 : undefined });
  const { busy, run } = useAction();

  const hidePost = async (p: Post) => {
    const note = p.status === "hidden" ? "" : window.prompt("Why hide this post? The Captain sees this.") ?? "";
    if (p.status !== "hidden" && !note.trim()) return;
    if (await run(() => post(`/admin/posts/${p.id}/moderate/`, { hidden: p.status !== "hidden", note }), p.status === "hidden" ? "Restored" : "Hidden")) posts.reload();
  };
  const hideReview = async (r: Review) => {
    if (await run(() => post(`/admin/reviews/${r.id}/hide/`, { hidden: !r.is_hidden, reason: r.is_hidden ? "" : "Policy violation" }), r.is_hidden ? "Review restored" : "Review hidden")) reviews.reload();
  };
  const cur = tab === "posts" ? posts : reviews;

  return (
    <div>
      <div className="page-head"><div><div className="eyebrow">Growth & trust</div><h1>Reels & reviews</h1></div></div>
      <div className="filters">
        <button className={`chip ${tab === "posts" ? "on" : ""}`} onClick={() => { setTab("posts"); setPage(1); }}>Reels & posts</button>
        <button className={`chip ${tab === "reviews" ? "on" : ""}`} onClick={() => { setTab("reviews"); setPage(1); }}>Reviews</button>
        {tab === "reviews" ? <button className={`chip ${low ? "on" : ""}`} onClick={() => setLow(!low)}>≤ 2 stars only</button> : null}
      </div>
      {cur.error ? <ErrorBox error={cur.error} retry={cur.reload} /> : !cur.data && cur.loading ? <Loading /> : !cur.data?.results.length ? <Empty>Nothing to moderate.</Empty> : tab === "posts" ? (
        <div className="post-grid">
          {posts.data!.results.map((p) => (
            <div key={p.id} className={`post ${p.status === "hidden" ? "dim" : ""}`}>
              <a href={p.media} target="_blank" rel="noreferrer" className="post-media">
                {p.thumbnail || p.kind === "photo" ? <img src={p.thumbnail || p.media} alt="" loading="lazy" /> : <span>▶ video</span>}
              </a>
              <div className="post-body">
                <div className="small"><b>{p.captain_name}</b> <span className="mono">{p.captain_code}</span></div>
                <div className="muted small clamp">{p.caption || "—"}</div>
                <div className="muted small">▶ {p.view_count} · ♥ {p.like_count} · {ago(p.created_at)}</div>
                <div className="row gap-s" style={{ marginTop: 6 }}>
                  <Badge s={p.status} />
                  <button className="btn small" disabled={busy} onClick={() => hidePost(p)}>{p.status === "hidden" ? "Restore" : "Hide"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="list">
          {reviews.data!.results.map((r) => (
            <div key={r.id} className={`list-row static ${r.is_hidden ? "dim" : ""}`}>
              <div className="grow">
                <b>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</b> <span className="mono">{r.booking_code}</span> · {r.traveler_name} → {r.captain_code}
                <div className="small">{r.comment || <span className="muted">No comment</span>}</div>
                {r.captain_reply ? <div className="muted small">Reply: {r.captain_reply}</div> : null}
              </div>
              <div className="right">
                {r.is_hidden ? <Badge s="hidden" /> : null}
                <button className="btn small" disabled={busy} onClick={() => hideReview(r)}>{r.is_hidden ? "Restore" : "Hide"}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pager page={cur.data} current={page} onPage={setPage} />
    </div>
  );
}
