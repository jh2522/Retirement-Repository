let portfolioChart = null;

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0
}).format(value);

function readInputs() {
  return {
    currentAge: Number($("currentAge").value),
    retirementAge: Number($("retirementAge").value),
    lifeExpectancy: Number($("lifeExpectancy").value),
    currentSavings: Number($("currentSavings").value),
    startingSalary: Number($("startingSalary").value),
    salaryGrowth: Number($("salaryGrowth").value) / 100,
    savingsRate: Number($("savingsRate").value) / 100,
    workingReturn: Number($("workingReturn").value) / 100,
    retirementReturn: Number($("retirementReturn").value) / 100,
    inflation: Number($("inflation").value) / 100,
    retirementSpending: Number($("retirementSpending").value),
    passiveIncome: Number($("passiveIncome").value)
  };
}

function validate(x) {
  if (x.retirementAge <= x.currentAge) return "Retirement age must be greater than current age.";
  if (x.lifeExpectancy < x.retirementAge) return "Life expectancy must be at least your retirement age.";
  if (x.currentAge < 18 || x.lifeExpectancy > 120) return "Please enter a reasonable age range.";
  if (Object.values(x).some(v => !Number.isFinite(v))) return "Please enter a value in every field.";
  return "";
}

/*
  Start-of-year calculation logic.

  Working years:
    Display the opening balance for the current age, then calculate:
    next year's balance = opening balance * (1 + working return)
                        + annual contribution * (1 + working return / 2)

  The half-year return on contributions mirrors the timing assumption
  used by the Excel model: contributions are treated as occurring
  throughout the year rather than entirely at year-end.

  Retirement:
    Display the opening balance for the current age, then calculate:
    next year's balance = (opening balance - net withdrawal)
                        * (1 + retirement return)

  Retirement spending and passive income grow with inflation each year.
*/
function calculateRetirement(x) {
  const rows = [];
  let portfolio = x.currentSavings;
  let salary = x.startingSalary;
  let runsOutAge = null;
  // Retirement spending is entered in today's dollars. Inflate it from
  // the user's current age to the first year of retirement, then continue
  // increasing it with inflation throughout retirement.
  let spending = x.retirementSpending * Math.pow(
    1 + x.inflation,
    Math.max(0, x.retirementAge - x.currentAge)
  );
  let passiveIncome = x.passiveIncome;

  for (let age = x.currentAge; age < x.retirementAge; age++) {
    const contribution = salary * x.savingsRate;

    rows.push({
      age, phase: "Working", salary, contribution,
      spending: null, passiveIncome: 0, withdrawal: 0,
      portfolio: Math.max(0, portfolio)
    });

    portfolio = portfolio * (1 + x.workingReturn)
              + contribution * (1 + x.workingReturn / 2);
    salary *= (1 + x.salaryGrowth);
  }

  for (let age = x.retirementAge; age <= x.lifeExpectancy; age++) {
    const withdrawal = Math.max(0, spending - passiveIncome);

    rows.push({
      age, phase: "Retirement", salary: null, contribution: 0,
      spending, passiveIncome, withdrawal,
      portfolio: Math.max(0, portfolio)
    });

    const nextPortfolio = (portfolio - withdrawal) * (1 + x.retirementReturn);
    // Report the age during which the portfolio is depleted. Depletion
    // during the life expectancy year does not count as running out within
    // the user's lifetime.
    if (runsOutAge === null && nextPortfolio <= 0 && age < x.lifeExpectancy) {
      runsOutAge = age;
    }
    portfolio = Math.max(0, nextPortfolio);
    spending *= (1 + x.inflation);
    passiveIncome *= (1 + x.inflation);
  }

  const retirementRow = rows.find(r => r.age === x.retirementAge);
  const finalRow = rows[rows.length - 1];
  return {
    rows,
    retirementBalance: retirementRow.portfolio,
    firstYearSpending: x.retirementSpending * Math.pow(1 + x.inflation, Math.max(0, x.retirementAge - x.currentAge)),
    finalBalance: finalRow.portfolio,
    runsOutAge
  };
}

function render(result, x) {
  $("results").hidden = false;
  $("retirementBalance").textContent = money(result.retirementBalance);
  $("firstYearSpending").textContent = money(result.firstYearSpending);
  let earliestRetirementAge = null;
  if (result.runsOutAge === null) {
    for (let age = x.currentAge + 1; age <= x.retirementAge; age++) {
      const candidate = calculateRetirement({ ...x, retirementAge: age });
      if (candidate.runsOutAge === null) {
        earliestRetirementAge = age;
        break;
      }
    }
  }
  $("earliestRetirementAge").textContent = earliestRetirementAge === null
    ? "N/A"
    : `Age ${earliestRetirementAge}`;
  $("runsOutAge").textContent = result.runsOutAge === null
    ? "Does not run out"
    : `Age ${result.runsOutAge}`;

  $("headline").textContent =
    result.finalBalance > 0
      ? `You're projected to have ${money(result.finalBalance)} at age ${x.lifeExpectancy}.`
      : `Your projected portfolio reaches $0 before age ${x.lifeExpectancy}.`;

  $("headlineText").textContent =
    `Based on a retirement age of ${x.retirementAge}, ${x.workingReturn * 100}% working-years return, ${x.retirementReturn * 100}% retirement return, and ${x.inflation * 100}% inflation.`;

  const ctx = $("portfolioChart").getContext("2d");
  if (portfolioChart) portfolioChart.destroy();

  const projectionStyling = {
    id: "projectionStyling",
    beforeDatasetsDraw(chart) {
      const index = chart.data.labels.indexOf(x.retirementAge);
      if (index < 0) return;
      const xPosition = chart.scales.x.getPixelForValue(index);
      const { top, bottom } = chart.chartArea;
      const drawCtx = chart.ctx;
      drawCtx.save();
      drawCtx.setLineDash([5, 5]);
      drawCtx.strokeStyle = "#d79a2b";
      drawCtx.lineWidth = 2;
      drawCtx.beginPath();
      drawCtx.moveTo(xPosition, top);
      drawCtx.lineTo(xPosition, bottom);
      drawCtx.stroke();
      drawCtx.setLineDash([]);
      drawCtx.fillStyle = "#9a6817";
      drawCtx.font = "600 12px system-ui";
      drawCtx.fillText("Retirement", Math.min(xPosition + 7, chart.width - 75), top + 14);
      drawCtx.restore();
    },
    afterDatasetsDraw(chart) {
      const index = chart.data.labels.indexOf(x.retirementAge);
      if (index < 0) return;
      const meta = chart.getDatasetMeta(0);
      const point = meta.data[index];
      if (!point) return;
      const drawCtx = chart.ctx;
      drawCtx.save();
      drawCtx.beginPath();
      drawCtx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      drawCtx.fillStyle = "#d79a2b";
      drawCtx.fill();
      drawCtx.lineWidth = 3;
      drawCtx.strokeStyle = "#ffffff";
      drawCtx.stroke();
      drawCtx.restore();
    }
  };

  portfolioChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: result.rows.map(r => r.age),
      datasets: [{
        label: "Projected portfolio",
        data: result.rows.map(r => r.portfolio),
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 3,
        borderColor: "#1d5f91",
        backgroundColor: "rgba(29, 95, 145, .13)",
        fill: "origin"
      }]
    },
    plugins: [projectionStyling],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: item => `Starting balance: ${money(item.raw)}` } }
      },
      scales: {
        x: { title: { display: true, text: "Age" }, grid: { display: false } },
        y: {
          title: { display: true, text: "Portfolio value" },
          ticks: { callback: value => money(value) },
          grid: { color: "rgba(53,79,96,.10)" }
        }
      }
    }
  });

  $("projectionTable").innerHTML = result.rows.map(r => {
    const annualIncome = r.phase === "Working" ? r.salary : r.passiveIncome;
    const savedOrSpent = r.phase === "Working" ? r.contribution : r.spending;
    const rowClass = r.phase === "Retirement" && r.age === x.retirementAge
      ? "retirement-start"
      : "";
    const retirementLabels = rowClass ? `
    <tr class="retirement-labels">
      <th>Age</th><th>Phase</th><th>Passive income</th><th>Spent each year</th><th>Starting portfolio</th>
    </tr>` : "";
    return `${retirementLabels}
    <tr class="${rowClass}">
      <td>${r.age}</td>
      <td>${r.phase}</td>
      <td>${annualIncome == null ? "—" : money(annualIncome)}</td>
      <td>${savedOrSpent == null ? "—" : money(savedOrSpent)}</td>
      <td><strong>${money(r.portfolio)}</strong></td>
    </tr>
  `;
  }).join("");
}

$("calculate").addEventListener("click", () => {
  const error = $("error");
  const x = readInputs();
  const message = validate(x);

  if (message) {
    error.textContent = message;
    error.hidden = false;
    return;
  }

  error.hidden = true;
  render(calculateRetirement(x), x);
});

document.querySelectorAll(".info-button").forEach(button => {
  button.addEventListener("click", event => {
    event.stopPropagation();
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    const willOpen = panel.hidden;
    document.querySelectorAll(".info-popover").forEach(item => { item.hidden = true; });
    document.querySelectorAll(".info-button").forEach(item => item.setAttribute("aria-expanded", "false"));
    panel.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  });
});

document.addEventListener("click", () => {
  document.querySelectorAll(".info-popover").forEach(item => { item.hidden = true; });
  document.querySelectorAll(".info-button").forEach(item => item.setAttribute("aria-expanded", "false"));
});

$("calculate").click();
