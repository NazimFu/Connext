'use client';

import React, { useState, useRef, useCallback } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Crop as CropIcon, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface ImageCropperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropComplete: (croppedImageUrl: string) => void;
  aspectRatio?: number;
  circularCrop?: boolean;
  title?: string;
  description?: string;
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

// Helper to check if URL is a Google Drive link
function isGoogleDriveUrl(url: string): boolean {
  return url.includes('drive.google.com');
}

// Helper to get proxied URL for Google Drive images
function getProxiedImageUrl(url: string): string {
  if (isGoogleDriveUrl(url)) {
    // Use our proxy API to fetch the image
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export function ImageCropper({
  open,
  onOpenChange,
  onCropComplete,
  aspectRatio = 1,
  circularCrop = true,
  title = 'Crop Profile Photo',
  description = 'Adjust your image to fit perfectly',
}: ImageCropperProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [loadedImageUrl, setLoadedImageUrl] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleUrlSubmit = async () => {
    if (!imageUrl.trim()) {
      setError('Please enter an image URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Store the original URL for reference
      setOriginalUrl(imageUrl.trim());
      
      // Get the proxied URL if it's a Google Drive link
      const proxyUrl = getProxiedImageUrl(imageUrl.trim());
      
      console.log('Original URL:', imageUrl);
      console.log('Proxied URL:', proxyUrl);

      // Test if image can be loaded
      const img = new Image();
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          console.log('Image loaded successfully');
          resolve();
        };
        img.onerror = (e) => {
          console.error('Image load failed:', e);
          reject(new Error('Failed to load image'));
        };
        img.src = proxyUrl;
      });

      setLoadedImageUrl(proxyUrl);
    } catch (err) {
      console.error('Image load error:', err);
      setError('Failed to load image. Please check the URL and make sure the image is publicly accessible.');
    } finally {
      setIsLoading(false);
    }
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, aspectRatio));
  }, [aspectRatio]);

  const getCroppedImage = useCallback(async (): Promise<string> => {
    const image = imgRef.current;
    const canvas = canvasRef.current;

    if (!image || !canvas || !completedCrop) {
      throw new Error('Crop data not available');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No 2d context');
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const outputSize = 400; // Output image size
    canvas.width = outputSize;
    canvas.height = outputSize;

    ctx.imageSmoothingQuality = 'high';

    const cropX = completedCrop.x * scaleX;
    const cropY = completedCrop.y * scaleY;
    const cropWidth = completedCrop.width * scaleX;
    const cropHeight = completedCrop.height * scaleY;

    // Clear canvas
    ctx.clearRect(0, 0, outputSize, outputSize);

    // Apply rotation
    const rotateRads = rotate * (Math.PI / 180);
    const centerX = outputSize / 2;
    const centerY = outputSize / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotateRads);
    ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);

    ctx.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      outputSize,
      outputSize,
    );

    ctx.restore();

    // If circular crop, apply circle mask
    if (circularCrop) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.arc(centerX, centerY, outputSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }

    return canvas.toDataURL('image/png', 1.0);
  }, [completedCrop, rotate, scale, circularCrop]);

  const handleCropSave = async () => {
    try {
      setIsLoading(true);
      const croppedImageUrl = await getCroppedImage();
      onCropComplete(croppedImageUrl);
      handleReset();
      onOpenChange(false);
    } catch (err) {
      setError('Failed to crop image. Please try again.');
      console.error('Crop error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setImageUrl('');
    setOriginalUrl('');
    setLoadedImageUrl('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setError(null);
    setScale(1);
    setRotate(0);
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CropIcon className="h-5 w-5 text-yellow-600" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* URL Input */}
          {!loadedImageUrl && (
            <div className="space-y-3">
              <Label htmlFor="image-url">Image URL (supports Google Drive links)</Label>
              <div className="flex gap-2">
                <Input
                  id="image-url"
                  type="text"
                  placeholder="https://drive.google.com/file/d/.../view or direct image URL"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  disabled={isLoading}
                />
                <Button
                  onClick={handleUrlSubmit}
                  disabled={isLoading || !imageUrl.trim()}
                  className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Paste a Google Drive sharing link or direct image URL
              </p>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                  <p className="text-xs text-red-500 mt-1">
                    Make sure the Google Drive image is shared with "Anyone with the link"
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Crop Area */}
          {loadedImageUrl && (
            <div className="space-y-4">
              {/* Image Cropper */}
              <div className="flex justify-center bg-gray-100 rounded-lg p-4 min-h-[300px]">
                <ReactCrop
                  crop={crop}
                  onChange={(_, percentCrop) => setCrop(percentCrop)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspectRatio}
                  circularCrop={circularCrop}
                  className="max-h-[400px]"
                >
                  <img
                    ref={imgRef}
                    src={loadedImageUrl}
                    alt="Crop preview"
                    onLoad={onImageLoad}
                    style={{
                      transform: `scale(${scale}) rotate(${rotate}deg)`,
                      maxHeight: '400px',
                      maxWidth: '100%',
                    }}
                  />
                </ReactCrop>
              </div>

              {/* Controls */}
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                {/* Zoom Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <ZoomIn className="h-4 w-4" />
                      Zoom
                    </Label>
                    <span className="text-sm text-gray-500">{Math.round(scale * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ZoomOut className="h-4 w-4 text-gray-400" />
                    <Slider
                      value={[scale]}
                      onValueChange={([value]) => setScale(value)}
                      min={0.5}
                      max={3}
                      step={0.1}
                      className="flex-1"
                    />
                    <ZoomIn className="h-4 w-4 text-gray-400" />
                  </div>
                </div>

                {/* Rotate Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Rotate
                    </Label>
                    <span className="text-sm text-gray-500">{rotate}°</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">-180°</span>
                    <Slider
                      value={[rotate]}
                      onValueChange={([value]) => setRotate(value)}
                      min={-180}
                      max={180}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-400">180°</span>
                  </div>
                </div>

                {/* Quick Rotate Buttons */}
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRotate((r) => Math.max(-180, r - 90))}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    -90°
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRotate(0);
                      setScale(1);
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRotate((r) => Math.min(180, r + 90))}
                  >
                    +90°
                    <RotateCcw className="h-4 w-4 ml-1 scale-x-[-1]" />
                  </Button>
                </div>
              </div>

              {/* Hidden canvas for cropping */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Change Image Button */}
              <Button
                variant="outline"
                onClick={handleReset}
                className="w-full"
              >
                Choose Different Image
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {loadedImageUrl && (
            <Button
              onClick={handleCropSave}
              disabled={isLoading || !completedCrop}
              className="bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CropIcon className="h-4 w-4 mr-2" />
                  Apply Crop
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}