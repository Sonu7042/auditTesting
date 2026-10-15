// Crops to a 4:5 portrait and shrinks to a small JPEG so ID photos stay light.
export const resizePhoto = (file, width = 360, height = 450) => new Promise((resolve, reject) => {
  if (!/^image\/(png|jpeg)$/.test(file.type)) return reject(new Error("Choose a JPEG or PNG photo."));
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const scale = Math.max(width / img.width, height / img.height); const w = img.width * scale; const h = img.height * scale;
    canvas.getContext("2d").drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    URL.revokeObjectURL(url); resolve(canvas.toDataURL("image/jpeg", 0.85));
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image could not be read.")); };
  img.src = url;
});
