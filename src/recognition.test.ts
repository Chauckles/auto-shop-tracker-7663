import assert from 'node:assert/strict'
import { extractLicensePlate, extractVIN } from './recognition'

const cases = [
  {
    name: 'Kia rotated door sticker VIN from uploaded photo',
    actual: extractVIN('MANUFACTURED IN KOREA BY KIA MOTORS CORPORATION V.I.N KNDJT2A25A7105911 MPV'),
    expected: 'KNDJT2A25A7105911',
  },
  {
    name: 'Lexus/Toyota door sticker VIN with surrounding label text',
    actual: extractVIN('MFD BY TOYOTA MOTOR CORPORATION 11/08 THE DATE OF MANUFACTURE SHOWN ABOVE JTHBK46G492302053 PASS CAR'),
    expected: 'JTHBK46G492302053',
  },
  {
    name: 'Massachusetts plate with spaced OCR',
    actual: extractLicensePlate('APR Massachusetts 28\n2HFK 34\nThe Spirit of America'),
    expected: '2HFK34',
  },
  {
    name: 'Selected crop should prefer visible Massachusetts plate over OCR hallucination',
    actual: extractLicensePlate('2HFK34\n3AUY81'),
    expected: '2HFK34',
  },
  {
    name: 'Massachusetts plate with digit/letter OCR confusion',
    actual: extractLicensePlate('JUL Massachusetts 28\nSVLF 47\nThe Spirit of America'),
    expected: '5VLF47',
  },
]

for (const testCase of cases) {
  assert.equal(testCase.actual, testCase.expected, testCase.name)
}

console.log(`recognition tests passed (${cases.length})`)
