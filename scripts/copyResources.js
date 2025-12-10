const fs = require('fs');
const path = require('path');

// Ensure output directory exists
const outDir = path.join(__dirname, '..', 'out', 'resources');
const srcFile = path.join(__dirname, '..', 'src', 'resources', 'devActionsView.html');
const destFile = path.join(outDir, 'devActionsView.html');

try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    
    // Copy the HTML file
    if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
        console.log(`✓ Copied ${srcFile} to ${destFile}`);
    } else {
        console.warn(`⚠ Warning: Source file not found: ${srcFile}`);
    }
} catch (error) {
    console.error('Error copying resources:', error);
    process.exit(1);
}

