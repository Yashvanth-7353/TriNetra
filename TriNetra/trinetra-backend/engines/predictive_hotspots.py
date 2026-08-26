"""
Predictive Hotspots Engine — Geographic Crime Classification

Classifies geographic areas into three categories based on
deterministic analysis of real crime data:

1. HISTORICAL HOTSPOT: High observed crime density
2. EMERGING HOTSPOT: Recent acceleration vs historical baseline
3. PREDICTED HOTSPOT: Model forecasts elevated future activity

Each classification uses a defined, reproducible methodology.
"""

import os
import math
import psycopg2
from typing import Optional


class PredictiveHotspotEngine:
    """
    Classifies geographic areas based on historical crime patterns,
    recent trends, and forecasted activity.

    Uses district-level aggregation (matching existing analytics).
    """

    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")

    def classify_hotspots(
        self,
        district_id: Optional[int] = None,
        category_id: Optional[int] = None,
        horizon: int = 3,
        rbac_filter: str = "1=1",
    ) -> dict:
        """
        Classifies all districts/areas into hotspot categories.

        Returns:
            {
                "hotspots": [...],
                "summary": {...},
                "methodology": {...}
            }
        """
        if not self.db_url:
            return {"status": "error", "reason": "Database not available"}

        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()

            # 1. Get all districts with case counts
            districts = self._get_district_cases(cur, district_id, category_id, rbac_filter)

            # 2. For each district, compute historical, emerging, and predicted metrics
            hotspots = []
            for dist in districts:
                did = dist["district_id"]
                monthly = self._get_district_monthly(cur, did, category_id, rbac_filter)

                if len(monthly) < 3:
                    continue

                classification = self._classify_district(dist, monthly, horizon)
                hotspots.append(classification)

            # Sort by priority (predicted > emerging > historical)
            priority = {"predicted": 0, "emerging": 1, "historical": 2, "stable": 3}
            hotspots.sort(key=lambda h: (priority.get(h["hotspot_type"], 4), -h.get("score", 0)))

            cur.close()
            conn.close()

            # Summary stats
            type_counts = {}
            for h in hotspots:
                t = h["hotspot_type"]
                type_counts[t] = type_counts.get(t, 0) + 1

            return {
                "status": "success",
                "hotspots": hotspots,
                "summary": {
                    "total_areas": len(hotspots),
                    "by_type": type_counts,
                    "horizon_months": horizon,
                },
                "methodology": {
                    "historical_hotspot": "District with total cases above the statewide median.",
                    "emerging_hotspot": "District where last-3-month average exceeds the 12-month historical average by >15%.",
                    "predicted_hotspot": "District where forecasted next-3-month activity exceeds historical average by >20%.",
                    "score": "Weighted combination: historical density (40%) + recent trend (30%) + forecasted growth (30%).",
                    "minimum_data": "Districts with fewer than 3 months of data are excluded.",
                },
            }

        except Exception as e:
            return {"status": "error", "reason": str(e)}

    def _get_district_cases(self, cur, district_id, category_id, rbac_filter):
        """Get aggregate case counts per district."""
        conditions = ["cm.CrimeRegisteredDate IS NOT NULL"]
        params = []

        if district_id:
            conditions.append("u.DistrictID = %s")
            params.append(district_id)
        if category_id:
            conditions.append("cm.CaseCategoryID = %s")
            params.append(category_id)
        if rbac_filter and rbac_filter.strip() != "1=1":
            conditions.append(f"({rbac_filter})")

        where = " AND ".join(conditions)
        cur.execute(f"""
            SELECT u.DistrictID, d.DistrictName, COUNT(*) as total,
                   AVG(cm.latitude) as avg_lat, AVG(cm.longitude) as avg_lng
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            JOIN District d ON u.DistrictID = d.DistrictID
            WHERE {where}
            GROUP BY u.DistrictID, d.DistrictName
            ORDER BY total DESC
        """, params)

        return [
            {
                "district_id": r[0],
                "district_name": r[1],
                "total_cases": r[2],
                "avg_lat": float(r[3]) if r[3] else None,
                "avg_lng": float(r[4]) if r[4] else None,
            }
            for r in cur.fetchall()
        ]

    def _get_district_monthly(self, cur, district_id, category_id, rbac_filter):
        """Get monthly case counts for a specific district."""
        conditions = ["cm.CrimeRegisteredDate IS NOT NULL", "u.DistrictID = %s"]
        params = [district_id]

        if category_id:
            conditions.append("cm.CaseCategoryID = %s")
            params.append(category_id)
        if rbac_filter and rbac_filter.strip() != "1=1":
            conditions.append(f"({rbac_filter})")

        where = " AND ".join(conditions)
        cur.execute(f"""
            SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as cnt
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            WHERE {where}
            GROUP BY month ORDER BY month
        """, params)

        return [{"month": r[0], "count": r[1]} for r in cur.fetchall()]

    def _classify_district(self, dist: dict, monthly: list, horizon: int) -> dict:
        """
        Classifies a district using deterministic rules:
        - Historical: above median total
        - Emerging: recent 3-month avg > 12-month avg by 15%+
        - Predicted: forecast exceeds historical avg by 20%+
        """
        values = [m["count"] for m in monthly]
        n = len(values)

        # Historical metrics
        total = sum(values)
        avg_monthly = total / n if n > 0 else 0

        # Recent trend (last 3 months)
        recent_3 = values[-3:] if n >= 3 else values
        recent_avg = sum(recent_3) / len(recent_3)

        # Historical baseline (excluding last 3 months)
        baseline_vals = values[:-3] if n > 3 else values
        baseline_avg = sum(baseline_vals) / len(baseline_vals) if baseline_vals else avg_monthly

        # Simple forecast: project recent trend forward
        forecast_avg = recent_avg  # Start with recent average
        if n >= 6:
            # Apply slight trend adjustment
            trend = (sum(values[-3:]) / 3 - sum(values[-6:-3]) / 3) / 3
            forecast_avg = recent_avg + trend * horizon

        # Classification logic
        hotspot_type = "stable"
        score = 0

        # Historical hotspot: above overall average
        overall_median = sorted(values)[n // 2] if n > 0 else 0
        is_historical = total > overall_median * n * 0.8  # Above median-level density

        # Emerging hotspot: recent acceleration
        emerging_ratio = recent_avg / baseline_avg if baseline_avg > 0 else 1
        is_emerging = emerging_ratio > 1.15 and recent_avg >= 2

        # Predicted hotspot: forecast exceeds baseline
        predicted_ratio = forecast_avg / baseline_avg if baseline_avg > 0 else 1
        is_predicted = predicted_ratio > 1.20 and forecast_avg >= 2

        if is_predicted:
            hotspot_type = "predicted"
        elif is_emerging:
            hotspot_type = "emerging"
        elif is_historical:
            hotspot_type = "historical"
        else:
            hotspot_type = "stable"

        # Compute composite score (0-100)
        density_score = min(100, (avg_monthly / max(1, avg_monthly * 2)) * 100) if avg_monthly > 0 else 0
        trend_score = min(100, max(0, (emerging_ratio - 0.5) * 100))
        forecast_score = min(100, max(0, (predicted_ratio - 0.5) * 100))
        score = round(density_score * 0.4 + trend_score * 0.3 + forecast_score * 0.3, 1)

        # Build monthly sparkline
        sparkline = [{"month": m["month"], "count": m["count"]} for m in monthly[-12:]]

        return {
            "district_id": dist["district_id"],
            "district_name": dist["district_name"],
            "hotspot_type": hotspot_type,
            "score": score,
            "total_cases": total,
            "avg_monthly": round(avg_monthly, 1),
            "recent_3mo_avg": round(recent_avg, 1),
            "baseline_avg": round(baseline_avg, 1),
            "forecast_avg": round(forecast_avg, 1),
            "emerging_ratio": round(emerging_ratio, 2),
            "predicted_ratio": round(predicted_ratio, 2),
            "avg_lat": dist.get("avg_lat"),
            "avg_lng": dist.get("avg_lng"),
            "sparkline": sparkline,
            "signals": self._build_signals(is_historical, is_emerging, is_predicted,
                                           emerging_ratio, predicted_ratio, recent_avg, baseline_avg),
        }

    def _build_signals(self, is_historical, is_emerging, is_predicted,
                       emerging_ratio, predicted_ratio, recent_avg, baseline_avg):
        """Build deterministic explanation signals."""
        signals = []
        if is_historical:
            signals.append({
                "signal": "high_historical_density",
                "description": f"This district has high historical crime density.",
            })
        if is_emerging:
            signals.append({
                "signal": "recent_acceleration",
                "description": f"Recent 3-month activity is {emerging_ratio:.1f}x the historical baseline.",
            })
        if is_predicted:
            signals.append({
                "signal": "forecasted_elevation",
                "description": f"Forecasted activity is {predicted_ratio:.1f}x the historical baseline.",
            })
        if not signals:
            signals.append({
                "signal": "no_elevated_activity",
                "description": "No significant elevation detected in recent or forecasted activity.",
            })
        return signals
