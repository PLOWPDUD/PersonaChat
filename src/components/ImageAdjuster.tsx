import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, ZoomIn, ZoomOut, Check, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { playSound } from '../lib/sounds';

interface ImageAdjusterProps {
  image: string;
  onComplete: (croppedImage: string) => void;
  onCancel: () => void;
  aspect?: number;
  shape?: 'rect' | 'round';
  title?: string;
}

export const ImageAdjuster: React.FC<ImageAdjusterProps> = ({
  image,
  onComplete,
  onCancel,
  aspect = 1,
  shape = 'rect',
  title = 'Adjust Image'
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: any
  ): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return '';
    }

    canvas.width = Math.min(pixelCrop.width, 1024);
    canvas.height = Math.min(pixelCrop.height, 1024);

    // Maintain aspect ratio if we downscale
    const ratio = Math.min(canvas.width / pixelCrop.width, canvas.height / pixelCrop.height);
    const finalWidth = pixelCrop.width * ratio;
    const finalHeight = pixelCrop.height * ratio;

    canvas.width = finalWidth;
    canvas.height = finalHeight;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      finalWidth,
      finalHeight
    );

    return canvas.toDataURL('image/jpeg', 0.6); // Lower quality to further reduce size
  };

  const handleComplete = async () => {
    try {
      playSound('click');
      const croppedImage = await getCroppedImg(image, croppedAreaPixels);
      onComplete(croppedImage);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 relative min-h-[400px] bg-zinc-950">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={shape}
            showGrid={true}
            onCropChange={setCrop}
            onCropComplete={onCropComplete}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-6 bg-zinc-900 border-t border-zinc-800 space-y-6">
          <div className="flex items-center gap-4">
            <ZoomOut className="w-5 h-5 text-zinc-500" />
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <ZoomIn className="w-5 h-5 text-zinc-500" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => {
                setZoom(1);
                setCrop({ x: 0, y: 0 });
                playSound('click');
              }}
              className="flex items-center gap-2 px-4 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all text-sm font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="px-6 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all text-sm font-bold"
              >
                <Check className="w-4 h-4" />
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
