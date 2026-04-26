import type { Node, Edge } from '@xyflow/react'

const EDGE_STYLE = { stroke: '#7c3aed', strokeWidth: 2 }

export const SAMPLE_WORKFLOW = {
  name: 'Product Marketing Kit Generator',
  nodes: [
    // Branch A — Image
    {
      id: 'sw-upload-image',
      type: 'uploadImageNode',
      position: { x: 80, y: 60 },
      data: {},
    },
    {
      id: 'sw-text-sys',
      type: 'textNode',
      position: { x: 80, y: 310 },
      data: {
        text: 'You are a professional marketing copywriter. Generate a compelling one-paragraph product description.',
      },
    },
    {
      id: 'sw-text-product',
      type: 'textNode',
      position: { x: 80, y: 470 },
      data: {
        text: 'Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.',
      },
    },
    {
      id: 'sw-crop',
      type: 'cropImageNode',
      position: { x: 380, y: 60 },
      data: { xPercent: 10, yPercent: 10, widthPercent: 80, heightPercent: 80 },
    },
    {
      id: 'sw-llm1',
      type: 'llmNode',
      position: { x: 680, y: 220 },
      data: { model: 'gemini-3.1-flash-lite-preview' },
    },
    // Branch B — Video
    {
      id: 'sw-upload-video',
      type: 'uploadVideoNode',
      position: { x: 80, y: 660 },
      data: {},
    },
    {
      id: 'sw-extract',
      type: 'extractFrameNode',
      position: { x: 380, y: 660 },
      data: { timestamp: '50%' },
    },
    // Convergence inputs
    {
      id: 'sw-text-social',
      type: 'textNode',
      position: { x: 80, y: 840 },
      data: {
        text: 'You are a social media manager. Create a tweet-length marketing post based on the product image and video frame.',
      },
    },
    // Convergence node
    {
      id: 'sw-llm2',
      type: 'llmNode',
      position: { x: 980, y: 470 },
      data: { model: 'gemini-3.1-flash-lite-preview' },
    },
  ] as Node[],

  edges: [
    // Branch A flow
    { id: 'sw-e1', source: 'sw-upload-image', target: 'sw-crop',  targetHandle: 'image_url',    animated: true, style: EDGE_STYLE },
    { id: 'sw-e2', source: 'sw-text-sys',     target: 'sw-llm1',  targetHandle: 'system_prompt', animated: true, style: EDGE_STYLE },
    { id: 'sw-e3', source: 'sw-text-product', target: 'sw-llm1',  targetHandle: 'user_message',  animated: true, style: EDGE_STYLE },
    { id: 'sw-e4', source: 'sw-crop',         target: 'sw-llm1',  targetHandle: 'images',        animated: true, style: EDGE_STYLE },
    // Branch B flow
    { id: 'sw-e5', source: 'sw-upload-video', target: 'sw-extract', targetHandle: 'video_url',   animated: true, style: EDGE_STYLE },
    // Convergence
    { id: 'sw-e6', source: 'sw-text-social',  target: 'sw-llm2',  targetHandle: 'system_prompt', animated: true, style: EDGE_STYLE },
    { id: 'sw-e7', source: 'sw-llm1',         target: 'sw-llm2',  targetHandle: 'user_message',  animated: true, style: EDGE_STYLE },
    { id: 'sw-e8', source: 'sw-crop',         target: 'sw-llm2',  targetHandle: 'images',        animated: true, style: EDGE_STYLE },
    { id: 'sw-e9', source: 'sw-extract',      target: 'sw-llm2',  targetHandle: 'images',        animated: true, style: EDGE_STYLE },
  ] as Edge[],
}
