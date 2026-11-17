// Loads Lc0 network weights (.pb / decompressed .pb.gz) and evaluates them in
// plain JavaScript. Supports the residual SE networks Maia uses: classical
// 112-plane input, convolutional or classical policy head, WDL or scalar value.
// Field numbers follow lczero-common/proto/net.proto.

import { INPUT_PLANES, POLICY_SIZE, convPolicyToFlat } from './encoder.js';

// ---------------------------------------------------------------------------
// Protobuf wire-format reader (only what net.proto needs).

function readVarint(bytes, cursor) {
  let result = 0;
  let shift = 0;
  let byte;
  do {
    byte = bytes[cursor.pos++];
    result += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return result;
}

// Returns Map<fieldNumber, Array<value>>; length-delimited values are Uint8Array views.
function readMessage(bytes) {
  const fields = new Map();
  const cursor = { pos: 0 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (cursor.pos < bytes.length) {
    const key = readVarint(bytes, cursor);
    const field = Math.floor(key / 8);
    const wire = key & 7;
    let value;
    if (wire === 0) {
      value = readVarint(bytes, cursor);
    } else if (wire === 1) {
      value = view.getFloat64(cursor.pos, true);
      cursor.pos += 8;
    } else if (wire === 2) {
      const len = readVarint(bytes, cursor);
      value = bytes.subarray(cursor.pos, cursor.pos + len);
      cursor.pos += len;
    } else if (wire === 5) {
      value = view.getFloat32(cursor.pos, true);
      cursor.pos += 4;
    } else {
      throw new Error(`unsupported protobuf wire type ${wire}`);
    }
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(value);
  }
  return fields;
}

const one = (fields, n) => (fields.get(n) || [])[0];
const sub = (fields, n) => (fields.has(n) ? readMessage(one(fields, n)) : null);

function halfToFloat(h) {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * 2 ** -14 * (frac / 1024);
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * 2 ** (exp - 15) * (1 + frac / 1024);
}

// Weights.Layer -> Float32Array. Encoding defaults to LINEAR16, as in lc0.
function decodeLayer(bytes) {
  if (!bytes) return new Float32Array(0);
  const f = readMessage(bytes);
  const min = one(f, 1) ?? 0;
  const max = one(f, 2) ?? 0;
  const params = one(f, 3) ?? new Uint8Array(0);
  const encoding = one(f, 4) ?? 1;
  const view = new DataView(params.buffer, params.byteOffset, params.byteLength);
  if (encoding === 4) {
    // FLOAT32
    const out = new Float32Array(params.byteLength / 4);
    for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
    return out;
  }
  const out = new Float32Array(params.byteLength / 2);
  for (let i = 0; i < out.length; i++) {
    const u = view.getUint16(i * 2, true);
    if (encoding === 1) {
      const theta = u / 0xffff;
      out[i] = min * (1 - theta) + max * theta;
    } else if (encoding === 2) {
      out[i] = halfToFloat(u);
    } else if (encoding === 3) {
      const tmp = new DataView(new ArrayBuffer(4));
      tmp.setUint32(0, u << 16);
      out[i] = tmp.getFloat32(0);
    } else {
      throw new Error(`unknown layer encoding ${encoding}`);
    }
  }
  return out;
}

// Weights.ConvBlock -> { weights, biases, outputs } with batch norm folded in,
// exactly like lc0's BaseWeights::ConvBlock.
function decodeConvBlock(fields) {
  if (!fields) return null;
  const weights = decodeLayer(one(fields, 1));
  let biases = decodeLayer(one(fields, 2));
  const means = decodeLayer(one(fields, 3));
  const variances = decodeLayer(one(fields, 4));
  let gammas = decodeLayer(one(fields, 5));
  let betas = decodeLayer(one(fields, 6));
  if (weights.length === 0) return null;

  const outputs = biases.length || means.length;
  if (!betas.length) {
    betas = new Float32Array(means.length);
    gammas = new Float32Array(means.length).fill(1);
  }
  if (!biases.length) biases = new Float32Array(means.length);

  if (means.length) {
    const inputs = weights.length / outputs;
    const folded = new Float32Array(outputs);
    for (let o = 0; o < outputs; o++) {
      const scale = gammas[o] / Math.sqrt(variances[o] + 1e-5);
      for (let c = 0; c < inputs; c++) weights[o * inputs + c] *= scale;
      folded[o] = -scale * (means[o] - biases[o]) + betas[o];
    }
    biases = folded;
  }
  return { weights, biases, outputs };
}

// ---------------------------------------------------------------------------
// Network

export function loadNetwork(bytes) {
  const net = readMessage(bytes);
  const weightsMsg = sub(net, 10);
  if (!weightsMsg) throw new Error('weights file has no Weights message (ONNX nets are not supported)');

  const fmt = sub(sub(net, 4) || new Map(), 2) || new Map();
  const format = {
    input: one(fmt, 1) ?? 1,
    output: one(fmt, 2) ?? 1,
    network: one(fmt, 3) ?? 1,
    policy: one(fmt, 4) ?? 1,
    value: one(fmt, 5) ?? 1,
    activation: one(fmt, 7) ?? 0,
  };
  if (format.input !== 1) throw new Error(`unsupported input format ${format.input} (need classical 112-plane)`);
  if (format.policy !== 1 && format.policy !== 2) throw new Error(`unsupported policy head ${format.policy}`);
  if (format.network === 6 || format.network === 7 || format.network === 134) {
    throw new Error('attention-body networks are not supported');
  }
  if (format.activation !== 0) throw new Error('only ReLU networks are supported');

  const residual = (weightsMsg.get(2) || []).map((bytes) => {
    const r = readMessage(bytes);
    const seMsg = sub(r, 3);
    const se = seMsg && {
      w1: decodeLayer(one(seMsg, 1)),
      b1: decodeLayer(one(seMsg, 2)),
      w2: decodeLayer(one(seMsg, 3)),
      b2: decodeLayer(one(seMsg, 4)),
    };
    return { conv1: decodeConvBlock(sub(r, 1)), conv2: decodeConvBlock(sub(r, 2)), se };
  });

  const model = {
    format,
    input: decodeConvBlock(sub(weightsMsg, 1)),
    residual,
    policy1: decodeConvBlock(sub(weightsMsg, 11)),
    policy: decodeConvBlock(sub(weightsMsg, 3)),
    ipPolW: decodeLayer(one(weightsMsg, 4)),
    ipPolB: decodeLayer(one(weightsMsg, 5)),
    value: decodeConvBlock(sub(weightsMsg, 6)),
    ip1ValW: decodeLayer(one(weightsMsg, 7)),
    ip1ValB: decodeLayer(one(weightsMsg, 8)),
    ip2ValW: decodeLayer(one(weightsMsg, 9)),
    ip2ValB: decodeLayer(one(weightsMsg, 10)),
  };
  model.filters = model.input.outputs;
  if (model.input.weights.length !== model.filters * INPUT_PLANES * 9) {
    throw new Error('unexpected input convolution shape');
  }
  return model;
}

// 3x3 (or 1x1) convolution over 8x8 planes with zero padding, plus bias and optional ReLU.
function conv(input, inChannels, block, kernel, relu) {
  const { weights, biases, outputs } = block;
  const out = new Float32Array(outputs * 64);
  const half = kernel >> 1;
  for (let o = 0; o < outputs; o++) {
    const ob = o * 64;
    for (let i = 0; i < inChannels; i++) {
      const ib = i * 64;
      const wb = (o * inChannels + i) * kernel * kernel;
      for (let ky = 0; ky < kernel; ky++) {
        const dy = ky - half;
        const y0 = Math.max(0, -dy);
        const y1 = Math.min(8, 8 - dy);
        for (let kx = 0; kx < kernel; kx++) {
          const w = weights[wb + ky * kernel + kx];
          if (w === 0) continue;
          const dx = kx - half;
          const x0 = Math.max(0, -dx);
          const x1 = Math.min(8, 8 - dx);
          for (let y = y0; y < y1; y++) {
            const orow = ob + y * 8;
            const irow = ib + (y + dy) * 8 + dx;
            for (let x = x0; x < x1; x++) out[orow + x] += w * input[irow + x];
          }
        }
      }
    }
    const b = biases[o];
    for (let s = 0; s < 64; s++) {
      const v = out[ob + s] + b;
      out[ob + s] = relu && v < 0 ? 0 : v;
    }
  }
  return out;
}

function dense(input, w, b, outputs, relu) {
  const inputs = input.length;
  const out = new Float32Array(outputs);
  for (let o = 0; o < outputs; o++) {
    let sum = b.length ? b[o] : 0;
    const wb = o * inputs;
    for (let i = 0; i < inputs; i++) sum += w[wb + i] * input[i];
    out[o] = relu && sum < 0 ? 0 : sum;
  }
  return out;
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Squeeze-and-excitation followed by the residual add and ReLU, as in lc0's ApplySEUnit.
function seResidual(x, skip, se, channels) {
  const pooled = new Float32Array(channels);
  for (let c = 0; c < channels; c++) {
    let sum = 0;
    for (let s = 0; s < 64; s++) sum += x[c * 64 + s];
    pooled[c] = sum / 64;
  }
  const seChannels = se.b1.length;
  const hidden = dense(pooled, se.w1, se.b1, seChannels, true);
  const gate = dense(hidden, se.w2, se.b2, 2 * channels, false);
  const out = new Float32Array(channels * 64);
  for (let c = 0; c < channels; c++) {
    const g = sigmoid(gate[c]);
    const beta = gate[c + channels];
    for (let s = 0; s < 64; s++) {
      const v = g * x[c * 64 + s] + beta + skip[c * 64 + s];
      out[c * 64 + s] = v < 0 ? 0 : v;
    }
  }
  return out;
}

// Runs the network on 112x64 input planes.
// Returns { policy: Float32Array(1858) of logits, wdl: [w, d, l] | null, q }.
export function evaluate(model, planes) {
  const filters = model.filters;
  let x = conv(planes, INPUT_PLANES, model.input, 3, true);

  for (const block of model.residual) {
    const skip = x;
    const h = conv(x, filters, block.conv1, 3, true);
    const y = conv(h, filters, block.conv2, 3, false);
    if (block.se) {
      x = seResidual(y, skip, block.se, filters);
    } else {
      x = new Float32Array(y.length);
      for (let i = 0; i < y.length; i++) {
        const v = y[i] + skip[i];
        x[i] = v < 0 ? 0 : v;
      }
    }
  }

  let policy;
  if (model.format.policy === 2) {
    const p1 = conv(x, filters, model.policy1, 3, true);
    const p2 = conv(p1, filters, model.policy, 3, false);
    policy = convPolicyToFlat(p2);
  } else {
    const p = conv(x, filters, model.policy, 1, true);
    policy = dense(p, model.ipPolW, model.ipPolB, POLICY_SIZE, false);
  }

  const v = conv(x, filters, model.value, 1, true);
  const hiddenSize = model.ip1ValB.length;
  const hidden = dense(v, model.ip1ValW, model.ip1ValB, hiddenSize, true);
  let wdl = null;
  let q;
  if (model.ip2ValB.length === 3) {
    const logits = dense(hidden, model.ip2ValW, model.ip2ValB, 3, false);
    const m = Math.max(...logits);
    const e = logits.map((l) => Math.exp(l - m));
    const sum = e[0] + e[1] + e[2];
    wdl = [e[0] / sum, e[1] / sum, e[2] / sum];
    q = wdl[0] - wdl[2];
  } else {
    q = Math.tanh(dense(hidden, model.ip2ValW, model.ip2ValB, 1, false)[0]);
  }
  return { policy, wdl, q };
}
