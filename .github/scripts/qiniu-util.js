import { loadEnv } from 'vite';
import ora from 'ora';

const spinner = ora({ color: 'green' });

const cilTips = ({ done = 0, total, type = 'uploading' }) => {
  if (total) {
    const percentage = Math.round((done / total) * 100);
    spinner.text = `Qiniu CDN ${type}: ${percentage}% ${done}/${total} \n`;
  } else {
    spinner.text = `wait for ${type}...\n`;
  }

  if (done === 0) {
    console.log('');
    spinner.start();
  }

  done === total && spinner.succeed();
};

const getConfigs = () => {
  const opts = {};

  const env = loadEnv(process.env.NODE_ENV, process.cwd(), '');

  opts.bucket = env.CI_CDN_BUCKET;
  if (!env.CI_CDN_BUCKET) throw new Error(`bucket MUST be provided`);

  opts.accessKey = env.CI_CDN_ACCESS_KEY;
  if (!env.CI_CDN_ACCESS_KEY)
    throw new Error(`accessKey MUST be provided`);

  opts.secretKey = env.CI_CDN_SECRET_KEY;
  if (!env.CI_CDN_SECRET_KEY)
    throw new Error(`secretKey MUST be provided`);

  opts.BUILD_PATH = env.VITE_APP_OUT_DIR || '/dist';

  if (env.CI_CDN_HOSTNAME)
    opts.cdnHostName = env.CI_CDN_HOSTNAME;
  if (!opts.cdnHostName) throw new Error(`cdnHostName MUST be provided`);

  if (env.CI_CDN_PATHNAME)
    opts.cdnPathname = env.CI_CDN_PATHNAME;
  if (!opts.cdnPathname) throw new Error(`cdnPathname MUST be provided`);

  return opts;
};

// auto join suffix slash ('/')
const formatCdnHostName = (cdnHostName, filePath) => {
  // 最后一个是 '/' 吗？
  // 是：http://XXX.clouddn.com + path
  // 否：http://XXX.clouddn.com + / + path
  return cdnHostName.substr && cdnHostName.substr(-1) === '/'
    ? `${cdnHostName}${filePath}`
    : `${cdnHostName}/${filePath}`;
};

const finish = ({ err, callback }) => {
  err && spinner.fail();
  callback && callback(err);
};

export {
  getConfigs,
  cilTips,
  finish,
  formatCdnHostName,
};
