let savingsChart = null;

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0
}).format(Math.abs(value) < 0.5 ? 0 : value);

function readInputs() {
  return {
    currentAge: Number($("currentAge").value),
    retirementAge: Number($("retirementAge").value),
    lifeExpectancy: Number($("lifeExpectancy").value),
    currentSavings: Number($("currentSavings").value),
    startingSalary: Number($("startingSalary").value),
    desiredEndingBalance: Number($("desiredEndingBalance").value),
    salaryGrowth: Number($("salaryGrowth").value) / 100,
    workingReturn: Number($("workingReturn").value) / 100,
    retirementReturn: Number($("retirementReturn").value) / 100,
    inflation: Number($("inflation").value) / 100,
    retirementSpending: Number($("retirementSpending").value),
    passiveIncome: Number($("passiveIncome").value)
  };
}

function validate(x) {
  if (x.retirementAge <= x.currentAge) return "Retirement age must be greater than current age.";
  if (x.lifeExpectancy < x.retirementAge) return "Plan-until age must be at least your retirement age.";
  if (x.currentAge < 18 || x.lifeExpectancy > 120) return "Please enter a reasonable age range.";
  if (x.startingSalary <= 0) return "Current annual salary must be greater than $0.";
  if (x.desiredEndingBalance < 0) return "Desired balance cannot be negative.";
  if (Object.values(x).some(v => !Number.isFinite(v))) return "Please enter a value in every field.";
  return "";
}

function simulateRawEndingBalance(x, savingsRate) {
  let portfolio = x.currentSavings;
  let salary = x.startingSalary;

  for (let age = x.currentAge; age < x.retirementAge; age++) {
    const contribution = salary * savingsRate;
    portfolio = portfolio * (1 + x.workingReturn)
              + contribution * (1 + x.workingReturn / 2);
    salary *= (1 + x.salaryGrowth);
  }

  let spending = x.retirementSpending * Math.pow(
    1 + x.inflation,
    x.retirementAge - x.currentAge
  );
  let passiveIncome = x.passiveIncome;

  for (let age = x.retirementAge; age < x.lifeExpectancy; age++) {
    const withdrawal = Math.max(0, spending - passiveIncome);
    portfolio = (portfolio - withdrawal) * (1 + x.retirementReturn);
    spending *= (1 + x.inflation);
    passiveIncome *= (1 + x.inflation);
  }

  return portfolio;
}

function solveSavingsRate(x) {
  const zeroRateBalance = simulateRawEndingBalance(x, 0);
  if (zeroRateBalance >= x.desiredEndingBalance) {
    return { status: "alreadyFunded", rate: 0, endingBalance: zeroRateBalance };
  }

  const fullRateBalance = simulateRawEndingBalance(x, 1);
  if (fullRateBalance < x.desiredEndingBalance) {
    return { status: "unattainable", rate: 1, endingBalance: fullRateBalance };
  }

  let low = 0;
  let high = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (simulateRawEndingBalance(x, mid) >= x.desiredEndingBalance) high = mid;
    else low = mid;
  }

  return {
    status: "solved",
    rate: high,
    endingBalance: simulateRawEndingBalance(x, high)
  };
}

function buildProjection(x, savingsRate) {
  const rows = [];
  let portfolio = x.currentSavings;
  let salary = x.startingSalary;

  for (let age = x.currentAge; age < x.retirementAge; age++) {
    const contribution = salary * savingsRate;
    rows.push({
      age: String(age), phase: "Working", salary, contribution,
      spending: null, passiveIncome: null, withdrawal: 0,
      portfolio: Math.max(0, portfolio)
    });
    portfolio = portfolio * (1 + x.workingReturn)
              + contribution * (1 + x.workingReturn / 2);
    salary *= (1 + x.salaryGrowth);
  }

  const retirementBalance = portfolio;
  let spending = x.retirementSpending * Math.pow(
    1 + x.inflation,
    x.retirementAge - x.currentAge
  );
  let passiveIncome = x.passiveIncome;

  for (let age = x.retirementAge; age < x.lifeExpectancy; age++) {
    const withdrawal = Math.max(0, spending - passiveIncome);
    rows.push({
      age: String(age), phase: "Retirement", salary: null, contribution: 0,
      spending, passiveIncome, withdrawal,
      portfolio: Math.max(0, portfolio)
    });
    portfolio = (portfolio - withdrawal) * (1 + x.retirementReturn);
    spending *= (1 + x.inflation);
    passiveIncome *= (1 + x.inflation);
  }

  const endingBalance = portfolio;
  rows.push({
    age: String(x.lifeExpectancy), phase: "Plan end", salary: null,
    contribution: 0, spending: null, passiveIncome: null, withdrawal: 0,
    portfolio: Math.max(0, endingBalance)
  });

  return { rows, retirementBalance, endingBalance };
}

function renderChart(projection, x) {
  const ctx = $("savingsChart").getContext("2d");
  if (savingsChart) savingsChart.destroy();

  const retirementMarker = {
    id: "savingsRetirementMarker",
    beforeDatasetsDraw(chart) {
      const index = chart.data.labels.indexOf(String(x.retirementAge));
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
    }
  };

  savingsChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: projection.rows.map(row => row.age),
      datasets: [{
        data: projection.rows.map(row => row.portfolio),
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 3,
        borderColor: "#1d5f91",
        backgroundColor: "rgba(29, 95, 145, .13)",
        fill: "origin"
      }]
    },
    plugins: [retirementMarker],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: item => `Balance: ${money(item.raw)}` } }
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
}

function render(solution, x) {
  $("results").hidden = false;
  const projection = buildProjection(x, solution.rate);
  const ratePercent = solution.rate * 100;
  const status = $("solverStatus");

  $("requiredRate").textContent = `${ratePercent.toFixed(2)}%`;
  $("monthlySavings").textContent = money(x.startingSalary * solution.rate / 12);
  $("solverRetirementBalance").textContent = money(projection.retirementBalance);
  $("solverFirstYearSpending").textContent = money(
    x.retirementSpending * Math.pow(1 + x.inflation, x.retirementAge - x.currentAge)
  );
  const earlierRetirementAge = x.retirementAge - 3;
  $("earlierRetirementLabel").textContent = earlierRetirementAge > x.currentAge
    ? `Savings rate to retire at ${earlierRetirementAge}`
    : "Savings rate to retire three years earlier";
  if (earlierRetirementAge <= x.currentAge) {
    $("earlierRetirementRate").textContent = "N/A";
  } else {
    const earlierSolution = solveSavingsRate({ ...x, retirementAge: earlierRetirementAge });
    $("earlierRetirementRate").textContent = earlierSolution.status === "unattainable"
      ? "N/A"
      : `${(earlierSolution.rate * 100).toFixed(2)}%`;
  }

  status.hidden = true;
  status.className = "solver-status";
  if (solution.status === "alreadyFunded") {
    $("resultExplanation").textContent = `Under these assumptions, your existing savings are projected to reach at least ${money(x.desiredEndingBalance)} at the start of age ${x.lifeExpectancy} without additional salary contributions.`;
    status.textContent = "No additional retirement savings are required by this simplified projection.";
    status.classList.add("success");
    status.hidden = false;
  } else if (solution.status === "unattainable") {
    $("requiredRate").textContent = "More than 100%";
    $("resultExplanation").textContent = "This retirement goal cannot be reached through salary savings alone under the current assumptions.";
    status.textContent = "Consider changing the retirement age, spending goal, income assumptions, or other inputs.";
    status.hidden = false;
  } else {
    $("resultExplanation").textContent = `Saving approximately ${ratePercent.toFixed(2)}% of salary each year is projected to leave ${money(x.desiredEndingBalance)} at the start of age ${x.lifeExpectancy}.`;
  }

  $("savingsProjectionTable").innerHTML = projection.rows.map(row => {
    const annualIncome = row.phase === "Working" ? row.salary : row.passiveIncome;
    const savedOrSpent = row.phase === "Working" ? row.contribution : row.spending;
    const rowClass = row.phase === "Retirement" && Number(row.age) === x.retirementAge
      ? "retirement-start"
      : "";
    return `
    <tr class="${rowClass}">
      <td>${row.age}</td>
      <td>${row.phase}</td>
      <td>${annualIncome == null ? "—" : money(annualIncome)}</td>
      <td>${savedOrSpent == null ? "—" : money(savedOrSpent)}</td>
      <td><strong>${money(row.portfolio)}</strong></td>
    </tr>
  `;
  }).join("");

  renderChart(projection, x);
}

$("calculateRate").addEventListener("click", () => {
  const error = $("error");
  const x = readInputs();
  const message = validate(x);
  if (message) {
    error.textContent = message;
    error.hidden = false;
    return;
  }
  error.hidden = true;
  render(solveSavingsRate(x), x);
});

$("calculateRate").click();
