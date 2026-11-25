// price in EGP / month. Limits: null = unlimited
module.exports = {
  free:     { price: 0,   customers: 15,   users: 1,  invoices: 30,   reports: false },
  pro:      { price: 299, customers: 300,  users: 5,  invoices: 2000, reports: true },
  business: { price: 799, customers: null, users: 25, invoices: null, reports: true },
};
