import { Router, Request, Response } from 'express';
import { Knex } from 'knex';
import { createAuthMiddleware } from '../middleware/authMiddleware.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../data/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

export function createDocumentRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  // List documents
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { fileType, vendorId, status } = req.query;
      let query = db('documents').orderBy('uploaded_at', 'desc');
      if (fileType) query = query.where('file_type', fileType);
      if (vendorId) query = query.where('vendor_id', vendorId);
      if (status) query = query.where('status', status);
      res.json(await query);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  // Upload document
  router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

      const docId_res = await db('documents').insert({
        file_name: req.file.originalname,
        file_path: req.file.filename,
        file_size: req.file.size,
        file_type: req.body.fileType || 'other',
        vendor_id: req.body.vendorId || null,
        vendor_name: req.body.vendorName || null,
        month: req.body.month || null,
        department: req.body.department || null,
        status: 'processing',
      }).returning("id"); const docId = typeof docId_res[0] === "object" ? (docId_res[0] as any).id : docId_res[0];

      // Try AI classification if Gemini key available
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey && req.file.mimetype.startsWith('image/')) {
        try {
          const imageBuffer = fs.readFileSync(req.file.path);
          const base64 = imageBuffer.toString('base64');
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

          const vendors = await db('vendors').select('id', 'name', 'service_type');
          const vendorList = vendors.map((v: any) => `${v.id}:${v.name}(${v.service_type})`).join(', ');

          const result = await model.generateContent([
            { text: `Classify this document. Return JSON: {"fileType":"logsheet|po|invoice|wcr|eway|other","vendorId":number|null,"vendorName":"","summary":"brief description"}. Vendors: ${vendorList}` },
            { inlineData: { mimeType: req.file.mimetype as any, data: base64 } },
          ]);

          const text = result.response.text();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            await db('documents').where('id', docId).update({
              file_type: parsed.fileType || 'other',
              vendor_id: parsed.vendorId || null,
              vendor_name: parsed.vendorName || null,
              summary: parsed.summary || null,
              extracted_data: JSON.stringify(parsed),
              status: 'mapped',
            });
          }
        } catch (aiErr) {
          console.log('AI classification skipped:', (aiErr as Error).message);
          await db('documents').where('id', docId).update({ status: 'mapped' });
        }
      } else {
        await db('documents').where('id', docId).update({ status: 'mapped' });
      }

      const doc = await db('documents').where('id', docId).first();
      res.status(201).json(doc);
    } catch (error) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Delete document
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const doc = await db('documents').where('id', req.params.id).first();
      if (doc?.file_path) {
        const filePath = path.join(UPLOAD_DIR, doc.file_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await db('documents').where('id', req.params.id).del();
      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete' });
    }
  });

  return router;
}
