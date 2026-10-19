const REQUIRED_DOCUMENTS = ['claim_form', 'hospital_bill', 'discharge_summary'];

const DOC_LABELS = {
  claim_form: 'Claim form',
  hospital_bill: 'Hospital bill',
  discharge_summary: 'Discharge summary',
};

// Fields each document must yield. A missing one becomes a "check manually" item.
const REQUIRED_FIELDS = {
  claim_form: ['claimId', 'patientRef', 'admissionDate', 'dischargeDate', 'claimedAmount'],
  hospital_bill: ['claimId', 'patientRef', 'admissionDate', 'dischargeDate', 'totalAmount'],
  discharge_summary: ['patientRef', 'admissionDate', 'dischargeDate'],
};

const FIELD_KINDS = {
  claimId: 'id',
  patientRef: 'id',
  admissionDate: 'date',
  dischargeDate: 'date',
  totalAmount: 'amount',
  claimedAmount: 'amount',
};

const FIELD_LABELS = {
  claimId: 'claim ID',
  patientRef: 'patient ID',
  admissionDate: 'admission date',
  dischargeDate: 'discharge date',
  totalAmount: 'total amount',
  claimedAmount: 'claimed amount',
  lineItems: 'line items',
};

module.exports = { REQUIRED_DOCUMENTS, DOC_LABELS, REQUIRED_FIELDS, FIELD_KINDS, FIELD_LABELS };
