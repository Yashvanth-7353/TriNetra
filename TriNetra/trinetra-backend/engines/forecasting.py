"""
Crime Forecasting Engine — Holt-Winters Exponential Smoothing

Data-driven crime forecasting using historical temporal patterns.
Provides monthly crime-category forecasts with prediction intervals,
baseline comparison, and structured signal extraction for explainability.

Model: Holt-Winters Triple Exponential Smoothing (additive seasonality)
Baseline: Seasonal Naive (previous year same month)
Evaluation: MAE, RMSE, MAPE on chronological train/test split

All results are deterministic and reproducible from the database.
"""

import os
import math
import psycopg2
from typing import Optional


# ════════════════════════════════════════════════════════════════
#  HOLT-WINTERS IMPLEMENTATION
# ════════════════════════════════════════════════════════════════

class HoltWinters:
    """
    Holt-Winters Triple Exponential Smoothing with additive seasonality.

    Produces level, trend, and seasonal components that capture:
    - Overall volume (level)
    - Direction of change (trend)
    - Recurring periodic patterns (seasonality)

    This is a well-established statistical method appropriate for
    monthly crime data with visible trend and seasonality.
    """

    def __init__(self, seasonal_period: int = 12):
        self.seasonal_period = seasonal_period

    def fit(self, data: list, alpha: float = 0.3, beta: float = 0.1, gamma: float = 0.3):
        """
        Fits the Holt-Winters model to observed data.

        Args:
            data: list of numeric values (monthly counts)
            alpha: level smoothing parameter (0-1)
            beta: trend smoothing parameter (0-1)
            gamma: seasonal smoothing parameter (0-1)

        Returns:
            dict with fitted components and in-sample fitted values
        """
        n = len(data)
        sp = self.seasonal_period

        if n < 2 * sp:
            # Not enough data for full seasonal initialization
            return self._fit_simple(data)

        # Initialize using first two seasonal periods
        level_init = sum(data[:sp]) / sp
        trend_init = (sum(data[sp:2*sp]) / sp - sum(data[:sp]) / sp) / sp

        level = [0.0] * (n + 1)
        trend = [0.0] * (n + 1)
        seasonal = [0.0] * (n + sp + 1)

        level[sp] = level_init
        trend[sp] = trend_init

        # Initialize seasonal factors
        for i in range(sp):
            seasonal[i + 1] = data[i] - level_init

        # Fit the model
        for t in range(sp, n):
            if t < sp:
                continue
            val = data[t]
            prev_level = level[t] if t < len(level) else level_init
            prev_trend = trend[t] if t < len(trend) else trend_init
            prev_seasonal = seasonal[t - sp + 1] if (t - sp + 1) < len(seasonal) else 0

            level[t + 1] = alpha * (val - prev_seasonal) + (1 - alpha) * (prev_level + prev_trend)
            trend[t + 1] = beta * (level[t + 1] - prev_level) + (1 - beta) * prev_trend
            seasonal[t + 1] = gamma * (val - level[t + 1]) + (1 - gamma) * prev_seasonal

        # Compute in-sample fitted values
        fitted = []
        for t in range(n):
            if t < sp:
                fitted.append(level_init + trend_init * (t - sp + 1) + seasonal[t + 1])
            else:
                s_idx = t - sp + 1
                if s_idx < len(seasonal):
                    fitted.append(level[t] + trend[t] + seasonal[s_idx])
                else:
                    fitted.append(level[t] + trend[t])

        return {
            "level": level,
            "trend": trend,
            "seasonal": seasonal,
            "fitted": fitted,
            "params": {"alpha": alpha, "beta": beta, "gamma": gamma},
        }

    def forecast(self, fitted_model: dict, horizon: int = 3) -> list:
        """
        Generates forecast for future periods.

        Args:
            fitted_model: output of fit()
            horizon: number of periods to forecast

        Returns:
            list of forecast dicts with point estimate and interval
        """
        level = fitted_model["level"]
        trend = fitted_model["trend"]
        seasonal = fitted_model["seasonal"]
        sp = self.seasonal_period
        n = len(level) - 1  # last fitted index

        forecasts = []
        for h in range(1, horizon + 1):
            t = n + h
            s_idx = t - sp
            if s_idx < 0:
                s_idx = t % sp

            seasonal_val = seasonal[s_idx] if s_idx < len(seasonal) else 0
            point = level[n] + trend[n] * h + seasonal_val

            # Widen interval with horizon (further = more uncertain)
            band = 0.15 + 0.03 * h  # 18% for h=1, 21% for h=2, 24% for h=3, etc.
            forecasts.append({
                "period": h,
                "forecast": max(0, round(point, 1)),
                "lower": max(0, round(point * (1 - band), 1)),
                "upper": round(point * (1 + band), 1),
            })

        return forecasts

    def _fit_simple(self, data: list) -> dict:
        """Simple exponential smoothing fallback for short series."""
        n = len(data)
        if n == 0:
            return {"level": [0], "trend": [0], "seasonal": [0] * 13, "fitted": [], "params": {}}

        alpha = 0.4
        level = [data[0]]
        trend_val = 0.0
        if n > 1:
            trend_val = (data[-1] - data[0]) / max(n - 1, 1)

        for i in range(1, n):
            level.append(alpha * data[i] + (1 - alpha) * (level[-1] + trend_val))

        return {
            "level": level + [level[-1]],
            "trend": [trend_val] * (n + 1),
            "seasonal": [0.0] * 13,
            "fitted": level,
            "params": {"alpha": alpha, "beta": 0, "gamma": 0, "simple": True},
        }


# ════════════════════════════════════════════════════════════════
#  EVALUATION METRICS
# ════════════════════════════════════════════════════════════════

def mae(actual: list, predicted: list) -> float:
    """Mean Absolute Error."""
    n = min(len(actual), len(predicted))
    if n == 0:
        return 0.0
    return sum(abs(actual[i] - predicted[i]) for i in range(n)) / n


def rmse(actual: list, predicted: list) -> float:
    """Root Mean Squared Error."""
    n = min(len(actual), len(predicted))
    if n == 0:
        return 0.0
    return math.sqrt(sum((actual[i] - predicted[i]) ** 2 for i in range(n)) / n)


def mape(actual: list, predicted: list) -> float:
    """Mean Absolute Percentage Error (skips zero actuals)."""
    n = min(len(actual), len(predicted))
    if n == 0:
        return 0.0
    total = 0.0
    count = 0
    for i in range(n):
        if actual[i] > 0:
            total += abs(actual[i] - predicted[i]) / actual[i]
            count += 1
    return (total / count * 100) if count > 0 else 0.0


def seasonal_naive_baseline(data: list, horizon: int = 3, period: int = 12) -> list:
    """
    Seasonal Naive baseline: forecast = same month from previous year.
    This is the baseline the Holt-Winters model must beat.
    """
    n = len(data)
    forecasts = []
    for h in range(1, horizon + 1):
        idx = n - period + (h - 1) % period
        if 0 <= idx < n:
            forecasts.append(max(0, data[idx]))
        else:
            forecasts.append(max(0, data[-1]))
    return forecasts


# ════════════════════════════════════════════════════════════════
#  SIGNAL EXTRACTION
# ════════════════════════════════════════════════════════════════

def extract_forecast_signals(data: list, forecast_vals: list, category: str) -> list:
    """
    Extracts deterministic signals that explain the forecast.
    These are computed from the actual data — not invented.
    """
    signals = []
    n = len(data)
    if n < 6:
        return [{"signal": "insufficient_data", "description": "Insufficient historical data for signal extraction."}]

    # 1. Recent trend (last 6 months vs previous 6 months)
    recent = data[-6:]
    prior = data[-12:-6] if n >= 12 else data[:max(n-6, 0)]
    if prior:
        recent_avg = sum(recent) / len(recent)
        prior_avg = sum(prior) / len(prior)
        if prior_avg > 0:
            change_pct = ((recent_avg - prior_avg) / prior_avg) * 100
            if abs(change_pct) > 5:
                signals.append({
                    "signal": "recent_trend",
                    "label": "Recent Trend",
                    "description": f"Recent 6-month average ({recent_avg:.0f}/month) is {change_pct:+.1f}% compared to prior 6-month average ({prior_avg:.0f}/month).",
                    "value": round(change_pct, 1),
                })

    # 2. Month-over-month change
    if n >= 2:
        last_change = data[-1] - data[-2]
        if abs(last_change) > 5:
            direction = "increased" if last_change > 0 else "decreased"
            signals.append({
                "signal": "mom_change",
                "label": "Month-over-Month",
                "description": f"Most recent month {direction} by {abs(last_change):.0f} cases ({data[-2]:.0f} → {data[-1]:.0f}).",
                "value": last_change,
            })

    # 3. Seasonal pattern detection
    if n >= 12:
        # Find peak and trough months
        monthly_avgs = {}
        for i, v in enumerate(data):
            month = i % 12
            if month not in monthly_avgs:
                monthly_avgs[month] = []
            monthly_avgs[month].append(v)
        monthly_means = {m: sum(vs)/len(vs) for m, vs in monthly_avgs.items()}
        overall_mean = sum(data) / n
        peak_month = max(monthly_means, key=monthly_means.get)
        trough_month = min(monthly_means, key=monthly_means.get)
        if monthly_means[peak_month] > overall_mean * 1.15:
            month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
            signals.append({
                "signal": "seasonal_pattern",
                "label": "Seasonal Pattern",
                "description": f"Historical peak activity observed in {month_names[peak_month]} (avg {monthly_means[peak_month]:.0f}). Trough in {month_names[trough_month]} (avg {monthly_means[trough_month]:.0f}).",
                "value": {"peak": month_names[peak_month], "trough": month_names[trough_month]},
            })

    # 4. Overall direction
    if n >= 6:
        first_half = sum(data[:n//2]) / (n//2)
        second_half = sum(data[n//2:]) / (n - n//2)
        if second_half > first_half * 1.1:
            signals.append({
                "signal": "upward_trajectory",
                "label": "Upward Trajectory",
                "description": f"Overall crime volume is trending upward. Second half average ({second_half:.0f}/month) exceeds first half ({first_half:.0f}/month).",
                "value": round(((second_half - first_half) / first_half) * 100, 1),
            })
        elif first_half > second_half * 1.1:
            signals.append({
                "signal": "downward_trajectory",
                "label": "Downward Trajectory",
                "description": f"Overall crime volume is trending downward.",
                "value": round(((second_half - first_half) / first_half) * 100, 1),
            })

    # 5. Forecast direction
    if forecast_vals:
        last_observed = data[-1] if data else 0
        avg_forecast = sum(forecast_vals) / len(forecast_vals)
        if avg_forecast > last_observed * 1.1:
            signals.append({
                "signal": "forecast_increase",
                "label": "Forecasted Increase",
                "description": f"Model forecasts average {avg_forecast:.0f} cases/month over the next {len(forecast_vals)} months, up from {last_observed:.0f} in the most recent month.",
                "value": round(avg_forecast - last_observed, 1),
            })
        elif avg_forecast < last_observed * 0.9:
            signals.append({
                "signal": "forecast_decrease",
                "label": "Forecasted Decrease",
                "description": f"Model forecasts average {avg_forecast:.0f} cases/month over the next {len(forecast_vals)} months, down from {last_observed:.0f} in the most recent month.",
                "value": round(last_observed - avg_forecast, 1),
            })

    return signals


# ════════════════════════════════════════════════════════════════
#  MAIN FORECASTING ENGINE
# ════════════════════════════════════════════════════════════════

class CrimeForecastingEngine:
    """
    Main forecasting engine that:
    1. Fetches real monthly crime data from the database
    2. Fits Holt-Winters model
    3. Generates forecasts with prediction intervals
    4. Compares against seasonal naive baseline
    5. Computes evaluation metrics
    6. Extracts explanatory signals
    """

    def __init__(self):
        self.db_url = os.getenv("NEON_DATABASE_URL")
        self.hw = HoltWinters(seasonal_period=12)
        self._cache = {}

    def forecast_category(
        self,
        category_id: Optional[int] = None,
        category_name: Optional[str] = None,
        district_id: Optional[int] = None,
        horizon: int = 3,
        rbac_filter: str = "1=1",
    ) -> dict:
        """
        Generates a monthly crime forecast for a specific category.

        Args:
            category_id: CaseCategoryID filter
            category_name: Display name (for response)
            district_id: District filter
            horizon: months to forecast (1-6)
            rbac_filter: SQL WHERE clause for RBAC

        Returns:
            Structured forecast result with historical data, forecast,
            baseline, evaluation, and signals.
        """
        cache_key = (category_id, district_id, horizon)
        if cache_key in self._cache:
            return self._cache[cache_key]

        horizon = max(1, min(horizon, 6))

        # 1. Fetch monthly data
        monthly_data = self._fetch_monthly_data(category_id, district_id, rbac_filter)

        if len(monthly_data) < 6:
            return {
                "status": "unavailable",
                "reason": f"Insufficient data: only {len(monthly_data)} months available. Need at least 6 for forecasting.",
                "months_available": len(monthly_data),
            }

        # 2. Build time series
        months = [d["month"] for d in monthly_data]
        values = [d["count"] for d in monthly_data]

        # 3. Split: train (all but last horizon), test (last horizon)
        train_end = len(values) - horizon
        train_data = values[:train_end]
        test_data = values[train_end:] if horizon <= len(values) else []

        # 4. Fit model on training data
        fitted = self.hw.fit(train_data)

        # 5. Generate forecast
        forecasts = self.hw.forecast(fitted, horizon=horizon)

        # 6. Generate baseline forecast (seasonal naive)
        baseline_forecast = seasonal_naive_baseline(train_data, horizon=horizon)

        # 7. Also fit on full data for the "production" forecast
        full_fitted = self.hw.fit(values)
        full_forecasts = self.hw.forecast(full_fitted, horizon=horizon)

        # 8. Compute evaluation metrics (on test period)
        evaluation = {}
        if test_data:
            hw_predictions = [f["forecast"] for f in forecasts]
            evaluation = {
                "model_mae": round(mae(test_data, hw_predictions), 2),
                "model_rmse": round(rmse(test_data, hw_predictions), 2),
                "model_mape": round(mape(test_data, hw_predictions), 1),
                "baseline_mae": round(mae(test_data, baseline_forecast), 2),
                "baseline_rmse": round(rmse(test_data, baseline_forecast), 2),
                "baseline_mape": round(mape(test_data, baseline_forecast), 1),
                "improvement_mae": round(
                    (1 - mae(test_data, hw_predictions) / max(mae(test_data, baseline_forecast), 0.01)) * 100, 1
                ),
                "train_months": len(train_data),
                "test_months": len(test_data),
            }

        # 9. Extract signals
        forecast_point_vals = [f["forecast"] for f in full_forecasts]
        signals = extract_forecast_signals(values, forecast_point_vals, category_name or "Unknown")

        # 10. Build historical time series with labels
        historical = [{"month": months[i], "count": values[i], "type": "observed"} for i in range(len(values))]

        # Build forecast time series
        last_month = months[-1] if months else "2026-01"
        forecast_series = []
        for f in full_forecasts:
            y, m = last_month.split("-")
            m_int = int(m) + f["period"]
            y_int = int(y)
            while m_int > 12:
                m_int -= 12
                y_int += 1
            forecast_month = f"{y_int}-{m_int:02d}"
            forecast_series.append({
                "month": forecast_month,
                "forecast": f["forecast"],
                "lower": f["lower"],
                "upper": f["upper"],
                "type": "forecast",
            })

        # Build baseline series
        baseline_series = []
        for i, b_val in enumerate(baseline_forecast):
            y, m = last_month.split("-")
            m_int = int(m) + i + 1
            y_int = int(y)
            while m_int > 12:
                m_int -= 12
                y_int += 1
            baseline_series.append({
                "month": f"{y_int}-{m_int:02d}",
                "count": b_val,
                "type": "baseline",
            })

        # Determine data sufficiency
        sufficient_data = len(values) >= 12

        result = {
            "status": "success",
            "category": category_name or "All Categories",
            "category_id": category_id,
            "district_id": district_id,
            "horizon_months": horizon,
            "model": "Holt-Winters Exponential Smoothing",
            "model_params": fitted.get("params", {}),
            "historical": historical,
            "forecast": forecast_series,
            "baseline": baseline_series,
            "evaluation": evaluation,
            "signals": signals,
            "data_sufficiency": {
                "total_months": len(values),
                "sufficient": sufficient_data,
                "min_required": 6,
                "note": "Recommended 12+ months for reliable seasonal detection." if len(values) < 12 else "Data sufficient for seasonal forecasting.",
            },
            "limitations": self._get_limitations(values, evaluation),
        }

        self._cache[cache_key] = result
        return result

    def forecast_all_categories(
        self,
        district_id: Optional[int] = None,
        horizon: int = 3,
        rbac_filter: str = "1=1",
    ) -> dict:
        """Forecasts all crime categories and returns a summary."""
        categories = self._get_categories()
        results = []
        for cat in categories:
            r = self.forecast_category(
                category_id=cat["id"],
                category_name=cat["name"],
                district_id=district_id,
                horizon=horizon,
                rbac_filter=rbac_filter,
            )
            if r.get("status") == "success":
                results.append({
                    "category_id": cat["id"],
                    "category": cat["name"],
                    "current_monthly_avg": round(sum(d["count"] for d in r["historical"][-6:]) / min(6, len(r["historical"][-6:])), 1) if r["historical"] else 0,
                    "forecast_avg": round(sum(f["forecast"] for f in r["forecast"]) / max(len(r["forecast"]), 1), 1),
                    "direction": "increasing" if r["forecast"] and r["forecast"][0]["forecast"] > (r["historical"][-1]["count"] if r["historical"] else 0) * 1.05 else "decreasing" if r["forecast"] and r["forecast"][0]["forecast"] < (r["historical"][-1]["count"] if r["historical"] else 0) * 0.95 else "stable",
                    "model_mape": r.get("evaluation", {}).get("model_mape", None),
                })

        return {
            "status": "success",
            "categories": results,
            "horizon_months": horizon,
        }

    def _fetch_monthly_data(
        self,
        category_id: Optional[int],
        district_id: Optional[int],
        rbac_filter: str,
    ) -> list:
        """Fetches monthly case counts from the database."""
        if not self.db_url:
            return []
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()

            conditions = ["cm.CrimeRegisteredDate IS NOT NULL"]
            params = []

            if category_id:
                conditions.append("cm.CaseCategoryID = %s")
                params.append(category_id)

            if district_id:
                conditions.append("u.DistrictID = %s")
                params.append(district_id)

            # Apply RBAC filter (simplified: only add if not default)
            if rbac_filter and rbac_filter.strip() != "1=1":
                conditions.append(f"({rbac_filter})")

            where = " AND ".join(conditions)

            cur.execute(f"""
                SELECT TO_CHAR(cm.CrimeRegisteredDate, 'YYYY-MM') as month, COUNT(*) as cnt
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE {where}
                GROUP BY month
                ORDER BY month
            """, params)

            result = [{"month": r[0], "count": r[1]} for r in cur.fetchall()]
            cur.close()
            conn.close()
            return result

        except Exception:
            return []

    def _get_categories(self) -> list:
        """Fetches crime categories from the database."""
        if not self.db_url:
            return []
        try:
            conn = psycopg2.connect(self.db_url)
            cur = conn.cursor()
            cur.execute("""
                SELECT cm.CaseCategoryID, cc.LookupValue, COUNT(*) as cnt
                FROM CaseMaster cm
                JOIN CaseCategory cc ON cm.CaseCategoryID = cc.CaseCategoryID
                GROUP BY cm.CaseCategoryID, cc.LookupValue
                HAVING COUNT(*) >= 30
                ORDER BY cnt DESC
            """)
            result = [{"id": r[0], "name": r[1], "count": r[2]} for r in cur.fetchall()]
            cur.close()
            conn.close()
            return result
        except Exception:
            return []

    def _get_limitations(self, values: list, evaluation: dict) -> list:
        """Returns honest limitations of the forecast."""
        limitations = []
        if len(values) < 12:
            limitations.append("Less than 12 months of data limits seasonal pattern detection.")
        if len(values) < 24:
            limitations.append("With limited historical depth, long-term seasonal cycles may not be fully captured.")
        if evaluation.get("model_mape", 100) > 30:
            limitations.append(f"Model MAPE of {evaluation['model_mape']:.1f}% indicates moderate forecast uncertainty.")
        if evaluation.get("improvement_mae", 0) < 0:
            limitations.append("Model underperforms the seasonal naive baseline for this category — interpret forecasts cautiously.")
        limitations.append("Forecasts assume historical patterns continue. Unforeseen events (policy changes, economic shifts) may alter trajectories.")
        limitations.append("Forecast intervals are approximate and should not be treated as precise bounds.")
        return limitations
