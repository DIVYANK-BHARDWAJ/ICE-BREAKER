import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

async function main() {
    const directories = ['public/assets', 'public/mascots'];
    for (const dir of directories) {
        const fullDir = path.resolve(root, dir);
        if (!fs.existsSync(fullDir)) continue;
        const files = fs.readdirSync(fullDir);
        for (const file of files) {
            if (file.match(/\.(png|jpe?g)$/i)) {
                const ext = path.extname(file);
                const base = path.basename(file, ext);
                const inputPath = path.join(fullDir, file);
                const outputPath = path.join(fullDir, `${base}.webp`);
                
                console.log(`Converting ${file} to ${base}.webp...`);
                await sharp(inputPath).webp().toFile(outputPath);
                fs.unlinkSync(inputPath);
            }
        }
    }

    // Replace in ts files
    const filesToUpdate = ['src/lib/questions.ts', 'src/lib/mascots.ts'];
    for (const file of filesToUpdate) {
        const filePath = path.resolve(root, file);
        if (fs.existsSync(filePath)) {
            let content = fs.readFileSync(filePath, 'utf8');
            content = content.replace(/\.png/g, '.webp').replace(/\.jpeg/g, '.webp').replace(/\.jpg/g, '.webp');
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${file}`);
        }
    }
}
main().catch(console.error);
