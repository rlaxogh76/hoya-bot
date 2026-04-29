const winston = require('winston');
require('winston-daily-rotate-file'); // 일자별 파일 저장을 위해 필수
const appRoot = require('app-root-path'); // 루트 경로 설정을 위해 사용

const transport = new winston.transports.DailyRotateFile({
  filename: `${appRoot}/logs/%DATE%.log`, // 저장 위치 및 파일명 형식 (logs 폴더 내)
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true, // 지난 로그 압축
  maxSize: '20m', // 파일 하나당 최대 크기
  maxFiles: '14d', // 14일치 로그만 보관
  level: 'error', // 'error' 레벨만 저장 (debug, info, warn, error 순)
});

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json() // 로그 형식
  ),
  transports: [
    transport,
    new winston.transports.Console() // 콘솔에도 출력
  ],
});

module.exports = logger;
