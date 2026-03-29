import React, { useEffect, useState } from 'react';

import { ImageViewerFrame } from './ImageViewerFrame';
import { ImageViewerSourceFrame, SvgSourceView } from './ImageViewerSourceFrame';
import { useImageViewerState } from './useImageViewerState';
import { useSvgSource } from './useSvgSource';

export interface ImageViewerProps {
  filePath: string;
  fileSize?: number;
}

/**
 * ImageViewer renders local image files using the file:// protocol.
 * Supports fit-to-window, 100%, zoom in/out with scroll wheel, pan with mouse drag,
 * checkerboard transparency background, and SVG source viewing via Monaco read-only.
 */
export function ImageViewer({
  filePath,
  fileSize,
}: ImageViewerProps): React.ReactElement<any> {
  const viewer = useImageViewerState(filePath);
  const isSvg = filePath.toLowerCase().endsWith('.svg');
  const [showSource, setShowSource] = useState(false);
  const svgSource = useSvgSource(filePath, isSvg);

  useEffect(() => {
    setShowSource(false);
  }, [filePath]);

  if (showSource && svgSource != null) {
    return (
      <ImageViewerSourceFrame
        fileSize={fileSize}
        viewer={viewer}
        isSvg={isSvg}
        showSource={showSource}
        onToggleSource={() => setShowSource((current) => !current)}
      >
        <SvgSourceView content={svgSource} filePath={filePath} />
      </ImageViewerSourceFrame>
    );
  }

  return (
    <ImageViewerFrame
      filePath={filePath}
      fileSize={fileSize}
      viewer={viewer}
      isSvg={isSvg}
      showSource={showSource}
      onToggleSource={() => setShowSource((value) => !value)}
    />
  );
}
