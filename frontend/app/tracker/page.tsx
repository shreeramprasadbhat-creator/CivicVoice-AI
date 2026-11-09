
"use client";

import { useState } from "react";

interface Complaint {
  complaint_id: string;
  description: string;
  location: string;
  category: string;
  severity: string;
  priority: string;
  status: string;
  created_at: string;
  latitude?: number;
  longitude?: number;
  report_count?: number;
}

export default function TrackComplaint() {
  const [complaintId, setComplaintId] = useState("");
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const trackComplaint = async () => {
    if (!complaintId.trim()) {
      setError("Please enter your complaint ID.");
      return;
    }

    setLoading(true);
    setError("");
    setComplaint(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/complaints/${encodeURIComponent(
          complaintId.trim()
        )}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Complaint not found. Please check your ID.");
        return;
      }

      setComplaint(data.complaint);
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "resolved":
        return "#15803d";
      case "in progress":
        return "#b45309";
      default:
        return "#1d4ed8";
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#f5f7fb",
      padding: "60px 20px",
      color: "#172b4d"
    }}>
      <div style={{ maxWidth: "760px", margin: "0 auto" }}>
        <a href="/" style={{
          color: "#173f77",
          textDecoration: "none",
          fontWeight: 600
        }}>
          ← Back to Home
        </a>

        <div style={{ textAlign: "center", margin: "40px 0 30px" }}>
          <h1 style={{ fontSize: "34px", marginBottom: "12px" }}>
            Track Your Complaint
          </h1>
          <p style={{ color: "#64748b" }}>
            Enter your complaint ID to check the latest progress.
          </p>
        </div>

        <div style={{
          background: "white",
          padding: "28px",
          borderRadius: "16px",
          boxShadow: "0 8px 30px rgba(15, 35, 65, 0.07)"
        }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: "10px" }}>
            Complaint ID
          </label>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              value={complaintId}
              onChange={(e) => setComplaintId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && trackComplaint()}
              placeholder="e.g. CVA-4A1683F0"
              style={{
                flex: "1 1 250px",
                minWidth: 0,
                padding: "14px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                fontSize: "15px"
              }}
            />

            <button
              onClick={trackComplaint}
              disabled={loading}
              style={{
                padding: "14px 24px",
                background: "#173f77",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                cursor: loading ? "wait" : "pointer"
              }}
            >
              {loading ? "Searching..." : "Track Complaint"}
            </button>
          </div>

          {error && (
            <p style={{ color: "#dc2626", marginTop: "16px" }}>
              {error}
            </p>
          )}
        </div>

        {complaint && (
          <section style={{
            background: "white",
            marginTop: "24px",
            padding: "28px",
            borderRadius: "16px",
            boxShadow: "0 8px 30px rgba(15, 35, 65, 0.07)"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap"
            }}>
              <div>
                <p style={{ color: "#64748b", fontSize: "13px" }}>
                  COMPLAINT REFERENCE
                </p>
                <h2 style={{ fontSize: "22px" }}>
                  {complaint.complaint_id}
                </h2>
                <button
  onClick={trackComplaint}
  disabled={loading}
  style={{
    marginTop: "12px",
    padding: "9px 16px",
    background: "#eff6ff",
    color: "#173f77",
    border: "1px solid #bfdbfe",
    borderRadius: "8px",
    fontWeight: 600,
    cursor: loading ? "wait" : "pointer",
  }}
>
  {loading ? "Refreshing..." : "↻ Refresh Status"}
</button>
              </div>

              <span style={{
                background: "#eff6ff",
                color: statusColor(complaint.status),
                padding: "9px 16px",
                borderRadius: "30px",
                fontWeight: 700,
                fontSize: "14px"
              }}>
                {complaint.status}
              </span>
            </div>

            <hr style={{ margin: "24px 0", borderColor: "#e2e8f0" }} />
            
{/* Complaint Progress Tracker */}
<div style={{ margin: "28px 0" }}>
  <h3 style={{ marginBottom: "24px" }}>Complaint Progress</h3>

  {[
    { label: "Submitted", description: "Complaint successfully registered" },
    { label: "In Progress", description: "Civic administration is working on the issue" },
    { label: "Resolved", description: "The reported issue has been addressed" },
  ].map((step, index) => {
    const status = complaint.status?.toLowerCase();
    const currentStep =
      status === "resolved" ? 2 :
      status === "in progress" ? 1 : 0;

    const completed = index <= currentStep;

    return (
      <div
        key={step.label}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          marginBottom: "22px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            flexShrink: 0,
            borderRadius: "50%",
            background: completed ? "#15803d" : "#e2e8f0",
            color: completed ? "white" : "#64748b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
          }}
        >
          {completed ? "✓" : index + 1}
        </div>

        <div>
          <strong style={{ color: completed ? "#15803d" : "#64748b" }}>
            {step.label}
          </strong>
          <p style={{ color: "#64748b", marginTop: "4px", fontSize: "14px" }}>
            {step.description}
          </p>
        </div>
      </div>
    );
  })}
</div>


            <h3 style={{ marginBottom: "12px" }}>Complaint Details</h3>
            <p style={{ color: "#475569", lineHeight: 1.7 }}>
              {complaint.description}
            </p>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "20px",
              marginTop: "26px"
            }}>
              <div>
                <p style={{ color: "#64748b", fontSize: "13px" }}>Category</p>
                <strong>{complaint.category}</strong>
              </div>

              <div>
                <p style={{ color: "#64748b", fontSize: "13px" }}>Severity</p>
                <strong>{complaint.severity}</strong>
              </div>

              <div>
                <p style={{ color: "#64748b", fontSize: "13px" }}>Priority</p>
                <strong>{complaint.priority}</strong>
              </div>

              <div>
                <p style={{ color: "#64748b", fontSize: "13px" }}>Citizen Reports</p>
                <strong>{complaint.report_count ?? 1}</strong>
              </div>
            </div>

            <div style={{ marginTop: "26px" }}>
              <p style={{ color: "#64748b", fontSize: "13px" }}>Reported Location</p>
              <strong>{complaint.location}</strong>
            </div>

            {complaint.created_at && (
              <div style={{ marginTop: "20px" }}>
                <p style={{ color: "#64748b", fontSize: "13px" }}>Submitted On</p>
                <strong>
                  {new Date(complaint.created_at).toLocaleString()}
                </strong>
              </div>
            )}

            {typeof complaint.latitude === "number" &&
              typeof complaint.longitude === "number" && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${complaint.latitude}&mlon=${complaint.longitude}#map=17/${complaint.latitude}/${complaint.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: "24px",
                    color: "#173f77",
                    fontWeight: 600
                  }}
                >
                  View reported location on map →
                </a>
              )}
          </section>
        )}
      </div>
    </main>
  );
}
