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

export function createOcrRoutes(db: Knex): Router {
  const router = Router();
  router.use(createAuthMiddleware(db));

  // Scan log sheet image
  router.post('/scan-logsheet', upload.single('image'), async (req: Request, res: Response) => {
    try {
      if (!req.file) { res.status(400).json({ error: 'No image uploaded' }); return; }

      const apiKey = process.env.GEMINI_API_KEY;
      let entries: any[] = [];
      let meta: any = {};
      let rawText = '';

      if (apiKey) {
        // Use Gemini Vision for accurate extraction
        try {
          const imageBuffer = fs.readFileSync(req.file.path);
          const base64 = imageBuffer.toString('base64');
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

          const prompt = `Analyze this vehicle log sheet image. Extract ALL entries as JSON.
Return ONLY raw JSON (no markdown):
{"meta":{"vehicleNumber":"","vehicleModel":"","period":""},"entries":[{"entryDate":"YYYY-MM-DD","deviceName":"","routeDescription":"","startingKm":"","endingKm":"","totalKm":"","remark":""}]}`;

          const result = await model.generateContent([
            { text: prompt },
            { inlineData: { mimeType: req.file.mimetype as any, data: base64 } },
          ]);

          const responseText = result.response.text();
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            entries = (parsed.entries || []).map((e: any) => ({
              entryDate: e.entryDate || '', deviceName: String(e.deviceName || ''),
              routeDescription: String(e.routeDescription || ''),
              startingKm: String(e.startingKm || ''), endingKm: String(e.endingKm || ''),
              totalKm: String(e.totalKm || ''), remark: String(e.remark || ''),
            }));
            meta = parsed.meta || {};
          }
        } catch (aiErr) {
          console.log('Gemini extraction failed, falling back to Tesseract:', (aiErr as Error).message);
        }
      }

      // Fallback: Tesseract OCR
      if (entries.length === 0) {
        try {
          const { createWorker } = await import('tesseract.js');
          const worker = await createWorker('eng');
          const { data } = await worker.recognize(req.file.path);
          rawText = data.text;
          await worker.terminate();
          const parsed = intelligentParse(rawText);
          entries = parsed.entries;
          meta = parsed.meta;
        } catch (ocrErr) {
          console.log('OCR skipped:', (ocrErr as Error).message);
        }
      }

      res.json({
        success: true, fileName: req.file.filename, imageUrl: `/uploads/${req.file.filename}`,
        extractedEntries: entries, extractedMeta: meta, rawText,
        message: entries.length > 0 ? `Extracted ${entries.length} entries` : 'Upload successful. Enter data manually.',
      });
    } catch (error) {
      res.status(500).json({ error: 'Scan failed' });
    }
  });

  // Generate Excel
  router.post('/generate-excel', async (req: Request, res: Response) => {
    try {
      const { entries, vendorName, period, vehicleNumber } = req.body;
      if (!entries?.length) { res.status(400).json({ error: 'No entries' }); return; }

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      const sheet = workbook.addWorksheet('Log Sheet');

      sheet.mergeCells('A1:G1');
      sheet.getCell('A1').value = 'VEHICLE LOG SHEET';
      sheet.getCell('A1').font = { size: 14, bold: true };
      sheet.getCell('A1').alignment = { horizontal: 'center' };
      sheet.getCell('A2').value = `Vendor: ${vendorName || ''}`;
      sheet.getCell('A3').value = `Period: ${period || ''}`;
      sheet.getCell('A4').value = `Vehicle: ${vehicleNumber || ''}`;

      const headerRow = 6;
      ['Date', 'Device', 'Route Description', 'Starting KM', 'Ending KM', 'Total KM', 'Remark'].forEach((h, i) => {
        const cell = sheet.getCell(headerRow, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.border = { bottom: { style: 'thin' } };
      });
      sheet.columns = [{ width: 14 }, { width: 18 }, { width: 35 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 22 }];

      let totalKm = 0;
      entries.forEach((entry: any, i: number) => {
        const row = headerRow + 1 + i;
        sheet.getCell(row, 1).value = entry.entryDate || '';
        sheet.getCell(row, 2).value = entry.deviceName || '';
        sheet.getCell(row, 3).value = entry.routeDescription || '';
        sheet.getCell(row, 4).value = entry.startingKm ? Number(entry.startingKm) : '';
        sheet.getCell(row, 5).value = entry.endingKm ? Number(entry.endingKm) : '';
        sheet.getCell(row, 6).value = entry.totalKm ? Number(entry.totalKm) : '';
        sheet.getCell(row, 7).value = entry.remark || '';
        totalKm += Number(entry.totalKm) || 0;
      });

      const totalRow = headerRow + entries.length + 2;
      sheet.getCell(totalRow, 5).value = 'Total:';
      sheet.getCell(totalRow, 5).font = { bold: true };
      sheet.getCell(totalRow, 6).value = totalKm;
      sheet.getCell(totalRow, 6).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=logsheet-${Date.now()}.xlsx`);
      res.send(Buffer.from(buffer));
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate Excel' });
    }
  });

  return router;
}

function intelligentParse(rawText: string) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  const entries: any[] = [];
  const meta: any = { vehicleNumber: '', vehicleModel: '' };

  const vehMatch = rawText.match(/([A-Z]{2}[\s\-]?\d{1,2}[\s\-]?[A-Z]{0,3}[\s\-]?\d{1,4})/i);
  if (vehMatch) meta.vehicleNumber = vehMatch[1].replace(/\s+/g, '-').toUpperCase();

  const dateRegex = /(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2,4})/;

  for (const line of lines) {
    if (/^(date|sl|sr|no|vehicle|log|sheet|total|driver)/i.test(line)) continue;
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    let year = dateMatch[3];
    if (year.length === 2) year = '20' + year;

    const allNumbers: number[] = [];
    for (const m of line.matchAll(/(\d+\.?\d*)/g)) {
      const n = parseFloat(m[1]);
      if (n > 30) allNumbers.push(n);
    }

    const kmCandidates = allNumbers.filter(n => n >= 100);
    let startingKm = '', endingKm = '', totalKm = '';
    if (kmCandidates.length >= 2) {
      startingKm = String(kmCandidates[0]);
      endingKm = String(kmCandidates[1]);
      totalKm = String(kmCandidates[1] - kmCandidates[0]);
    }

    let route = line.replace(dateRegex, '').replace(/\d+/g, '').replace(/[|\\\/\[\]{}()]/g, ' ').replace(/\s{2,}/g, ' ').trim();

    entries.push({ entryDate: `${year}-${month}-${day}`, deviceName: '', routeDescription: route, startingKm, endingKm, totalKm, remark: '' });
  }

  return { entries, meta };
}
