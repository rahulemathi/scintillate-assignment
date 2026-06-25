const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

dotenv.config({ path: path.join(__dirname, '.env') });
const Lead = require('./models/Lead');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

let memoryLeads = [];
let dbReady = false;
let changeStream = null;

async function seedDemoLeads() {
  const demoLeads = [
    {
      linkedin_url: 'https://www.linkedin.com/in/demo-1',
      source: 'n8n',
      name: 'Ava Chen',
      title: 'VP Sales',
      company: 'Northwind Labs',
      industry: 'SaaS',
      email: 'ava@northwindlabs.com',
      company_size: 120,
      funding_status: 'Series A',
      score: 82,
      score_breakdown: { role: 30, funding: 25, size: 20, fit: 7 },
      status: 'new',
      notes: ['Warm intro from partner'],
      created_at: new Date()
    },
    {
      linkedin_url: 'https://www.linkedin.com/in/demo-2',
      source: 'php_form',
      name: 'Marcus Lee',
      title: 'Head of Revenue',
      company: 'Blue Harbor',
      industry: 'Fintech',
      email: 'marcus@blueharbor.com',
      company_size: 60,
      funding_status: 'Bootstrapped',
      score: 64,
      score_breakdown: { role: 20, funding: 15, size: 12, fit: 17 },
      status: 'contacted',
      notes: ['Follow-up next week'],
      created_at: new Date()
    },
    {
      linkedin_url: 'https://www.linkedin.com/in/demo-3',
      source: 'n8n',
      name: 'Nadia Patel',
      title: 'Director of Operations',
      company: 'Signal Forge',
      industry: 'AI',
      email: 'nadia@signalforge.com',
      company_size: 20,
      funding_status: 'Pre-seed',
      score: 47,
      score_breakdown: { role: 14, funding: 10, size: 8, fit: 15 },
      status: 'new',
      notes: [],
      created_at: new Date()
    }
  ];

  await Lead.insertMany(demoLeads);
  console.log('Seeded demo leads.');
}

async function connectToDatabase() {
  if (!process.env.MONGO_URI) {
    console.warn('MONGO_URI not set. Using in-memory lead store.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      dbName: process.env.MONGO_DB_NAME || 'leadgen'
    });
    dbReady = true;
    console.log('MongoDB connected.');
    startLeadChangeStream();

    if (process.env.SEED_DEMO_DATA !== 'false') {
      const existingCount = await Lead.countDocuments();
      if (existingCount === 0) {
        await seedDemoLeads();
      }
    }
  } catch (error) {
    console.warn('MongoDB unavailable, falling back to in-memory store:', error.message);
  }
}

function startLeadChangeStream() {
  if (!dbReady || changeStream) return;

  const collectionName = process.env.MONGO_COLLECTION_NAME || 'leads';
  const collection = mongoose.connection.db.collection(collectionName);

  changeStream = collection.watch([], { fullDocument: 'updateLookup' });
  changeStream.on('change', (change) => {
    if (!change || !change.fullDocument) return;

    if (change.operationType === 'insert') {
      const serialized = serializeLead(change.fullDocument);
      io.emit('new_lead', serialized);
      console.log(`Live update emitted for new lead: ${serialized.name || serialized._id}`);
    }
  });

  changeStream.on('error', (error) => {
    console.error('MongoDB change stream error:', error.message);
    changeStream = null;
  });
}

function normalizeNotes(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function normalizeScoreBreakdown(lead = {}) {
  const source = lead.score_breakdown || lead.scoreBreakdown || lead.score_details || lead.scoreDetails;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return Object.fromEntries(
      Object.entries(source)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [key, typeof value === 'string' ? value : String(value)])
    );
  }

  const reasons = lead.score_reasons || lead.scoreReasons || lead.reasons || [];
  if (Array.isArray(reasons) && reasons.length > 0) {
    return reasons.reduce((acc, item, index) => {
      if (typeof item === 'string') {
        acc[`reason_${index + 1}`] = item;
        return acc;
      }
      if (item && typeof item === 'object') {
        const key = item.label || item.reason || item.name || `reason_${index + 1}`;
        const value = item.score ?? item.value ?? item.points ?? 1;
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  const fallback = lead.score_breakdown_json || lead.scoreBreakdownJson;
  if (typeof fallback === 'string') {
    try {
      const parsed = JSON.parse(fallback);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeScoreBreakdown(parsed);
      }
    } catch {
      // Ignore invalid JSON and fall back to empty breakdown
    }
  }

  return {};
}

function serializeLead(lead) {
  return {
    _id: lead._id || lead.id,
    linkedin_url: lead.linkedin_url,
    source: lead.source,
    name: lead.name,
    title: lead.title,
    company: lead.company,
    industry: lead.industry,
    email: lead.email,
    company_size: lead.company_size,
    funding_status: lead.funding_status,
    score: lead.score,
    score_breakdown: normalizeScoreBreakdown(lead),
    status: lead.status,
    notes: normalizeNotes(lead.notes),
    created_at: lead.created_at || new Date()
  };
}

function findLeadByLinkedinUrl(url) {
  if (dbReady) {
    return Lead.findOne({ linkedin_url: url });
  }

  return Promise.resolve(memoryLeads.find((lead) => lead.linkedin_url === url));
}

function getAllLeads() {
  if (dbReady) {
    return Lead.find().sort({ created_at: -1 }).lean();
  }

  return Promise.resolve([...memoryLeads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
}

async function createOrUpdateLead(input) {
  const payload = {
    linkedin_url: input.linkedin_url,
    source: input.source,
    name: input.name,
    title: input.title,
    company: input.company,
    industry: input.industry,
    email: input.email,
    company_size: input.company_size,
    funding_status: input.funding_status,
    score: input.score || 0,
    score_breakdown: normalizeScoreBreakdown(input),
    status: input.status || 'new',
    notes: normalizeNotes(input.notes),
    created_at: input.created_at || new Date()
  };

  if (dbReady) {
    const existing = await findLeadByLinkedinUrl(payload.linkedin_url);
    if (existing) {
      const updated = await Lead.findOneAndUpdate(
        { linkedin_url: payload.linkedin_url },
        { $set: payload },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return updated;
    }

    const lead = new Lead(payload);
    await lead.save();
    return lead;
  }

  const existing = memoryLeads.find((lead) => lead.linkedin_url === payload.linkedin_url);
  if (existing) {
    Object.assign(existing, payload);
    return existing;
  }

  const lead = { ...payload, _id: `${Date.now()}` };
  memoryLeads.unshift(lead);
  return lead;
}

async function patchLeadById(id, updates) {
  if (dbReady) {
    const lead = await Lead.findByIdAndUpdate(id, updates, { new: true });
    return lead;
  }

  const index = memoryLeads.findIndex((lead) => lead._id === id);
  if (index === -1) {
    return null;
  }

  memoryLeads[index] = { ...memoryLeads[index], ...updates };
  return memoryLeads[index];
}

async function deleteLeadById(id) {
  if (dbReady) {
    const lead = await Lead.findByIdAndDelete(id);
    return lead;
  }

  const index = memoryLeads.findIndex((lead) => lead._id === id);
  if (index !== -1) {
    memoryLeads.splice(index, 1);
    return true;
  }
  return false;
}

app.get('/api/leads', async (req, res) => {
  try {
    const { score_min, score_max, status, source, industry } = req.query;
    const leads = await getAllLeads();

    const filtered = leads.filter((lead) => {
      const score = Number(lead.score || 0);
      const matchesMin = score_min === undefined || score >= Number(score_min);
      const matchesMax = score_max === undefined || score <= Number(score_max);
      const matchesStatus = !status || lead.status === status;
      const matchesSource = !source || lead.source === source;
      const matchesIndustry = !industry || lead.industry === industry;
      return matchesMin && matchesMax && matchesStatus && matchesSource && matchesIndustry;
    });

    res.json(filtered.map(serializeLead));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch leads', error: error.message });
  }
});

app.get('/api/leads/:id', async (req, res) => {
  try {
    const lead = dbReady ? await Lead.findById(req.params.id) : memoryLeads.find((item) => item._id === req.params.id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    res.json(serializeLead(lead));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch lead', error: error.message });
  }
});

app.patch('/api/leads/:id', async (req, res) => {
  try {
    const { status, note } = req.body;
    const trimmedNote = typeof note === 'string' ? note.trim() : '';

    if (trimmedNote) {
      if (dbReady) {
        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });

        const nextNotes = [...normalizeNotes(lead.notes), trimmedNote];
        const nextStatus = status !== undefined ? status : lead.status;
        const updatedLead = await Lead.findByIdAndUpdate(
          req.params.id,
          { $set: { status: nextStatus, notes: nextNotes } },
          { new: true }
        );

        return res.json(serializeLead(updatedLead));
      }

      const lead = memoryLeads.find((item) => item._id === req.params.id);
      if (!lead) return res.status(404).json({ message: 'Lead not found' });
      if (status !== undefined) lead.status = status;
      lead.notes = [...normalizeNotes(lead.notes), trimmedNote];
      return res.json(serializeLead(lead));
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    const lead = await patchLeadById(req.params.id, updates);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(serializeLead(lead));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update lead', error: error.message });
  }
});

app.post('/api/webhook/lead', async (req, res) => {
  try {
    const lead = await createOrUpdateLead(req.body);
    const serialized = serializeLead(lead);

    if (!dbReady) {
      io.emit('new_lead', serialized);
    }

    if (serialized.score >= 70) {
      console.log(`HIGH SCORE LEAD: ${serialized.name}`);
    }

    res.status(201).json(serialized);
  } catch (error) {
    res.status(500).json({ message: 'Failed to save lead', error: error.message });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    const removed = await deleteLeadById(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Lead not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete lead', error: error.message });
  }
});

io.on('connection', (socket) => {
  socket.emit('connection_status', { connected: true });
  socket.on('disconnect', () => {
    socket.emit('connection_status', { connected: false });
  });
});

connectToDatabase().then(() => {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
});
