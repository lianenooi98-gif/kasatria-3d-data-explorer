export function createCompanyCard(company) {
  const card = document.createElement('div')

  card.className = 'company-card'

  card.innerHTML = `
    <h2>${company.name}</h2>
    <p>Industry: ${company.industry}</p>
    <p>Net Worth: ${company.netWorth}</p>
  `

  return card
}