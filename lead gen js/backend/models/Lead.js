const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const collectionName = process.env.MONGO_COLLECTION_NAME || 'leads';

const leadSchema = new mongoose.Schema({
  linkedin_url: { type: String, unique: true, required: true },
  source: { type: String, enum: ['n8n', 'php_form'] },
  name: String,
  title: String,
  company: String,
  industry: String,
  email: String,
  company_size: Number,
  funding_status: String,
  score: { type: Number, default: 0 },
  score_breakdown: { type: Object, default: {} },
  status: { type: String, enum: ['new', 'contacted', 'qualified', 'rejected'], default: 'new' },
  notes: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now }
}, {
  collection: collectionName
});

module.exports = mongoose.model('Lead', leadSchema, collectionName);
