import _ from 'lodash';
import glob from 'glob';
import qiniu from 'qiniu';
import {
  cilTips,
  finish,
  getConfigs,
  formatCdnHostName,
} from './qiniu-util.js';

const MAX_REFRESH_SIZE = 100;
const BATCH_UPLOAD_SIZE = 20;
const RPC_TIMEOUT = 600000;

const refreshFiles = (fileNames, mac, cdnHostName) => {
  const cdnManager = new qiniu.cdn.CdnManager(mac);

  const refreshTotal = fileNames.length;
  const type = 'refreshing';
  let refreshedCount = 0;

  cilTips({ type });

  const refreshFile = (cdnFileUrls) => {
    return new Promise((resolve, reject) => {
      cdnManager.refreshUrls(cdnFileUrls, (err, res, resRaw) => {
        refreshedCount += cdnFileUrls.length;

        cilTips({ done: refreshedCount, total: refreshTotal, type });

        if (err) reject(err);

        if (resRaw.statusCode === 200) {
          // respBody = JSON.parse(respBody);
          if (res.code === 200 || res.error === 'success') resolve();

          // eslint-disable-next-line prefer-promise-reject-errors
          reject({ message: `refresh error`, respBody: res });
        } else {
          reject(res);
        }
      });
    });
  };

  //每次只能包含100个cdn链接
  return Promise.all(
    _.chunk(fileNames, MAX_REFRESH_SIZE).map((chunkFiles) =>
      refreshFile(
        chunkFiles.map((name) => formatCdnHostName(cdnHostName, name)),
      ),
    ),
  );
};

const execUpload = (fileNames, opts, callback) => {
  // init config
  const qiniuConfig = new qiniu.conf.Config();
  qiniu.conf.RPC_TIMEOUT = RPC_TIMEOUT;

  const {
    bucket,
    accessKey,
    secretKey,
    batchUploadSize = BATCH_UPLOAD_SIZE,
    cdnHostName,
    cdnPathname,
    refreshCdn = false,
  } = opts;

  const filePathsTotal = fileNames.length;
  let uploadedCount = 0;

  // e.g.
  const uploadFile = (fileName) => {
    const cdnFile = `${cdnPathname}/${fileName}`;
    console.log(cdnFile);
    const localFile = fileName;

    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
    const putPolicy = new qiniu.rs.PutPolicy({ scope: `${bucket}:${cdnFile}` });
    const upToken = putPolicy.uploadToken(mac);
    const formUploader = new qiniu.form_up.FormUploader(qiniuConfig);
    const putExtra = new qiniu.form_up.PutExtra();

    return new Promise((resolve, reject) => {
      formUploader.putFile(
        upToken,
        cdnFile, // key 目标文件名
        localFile, // localFile 本地文件路径
        putExtra,
        (err, respBody, respInfo) => {
          uploadedCount += 1;

          cilTips({ done: uploadedCount, total: filePathsTotal });

          if (err) {
            console.log(`${fileName} UploadFile Failed`);
            reject(err);
          } else if (respInfo.statusCode === 200) {
            // console.log(ret.hash, ret.key, ret.persistentId);
            resolve();
          } else {
            reject(respBody);
          }
        },
      );
    });
  };

  // 切片上传
  const _fileNames = [...fileNames];

  const batchUploadFiles = (err) => {
    const files = [].splice.call(_fileNames, 0, batchUploadSize);

    if (err) return Promise.reject(err);

    if (files.length > 0) {
      return Promise.all(files.map((fileName) => uploadFile(fileName)))
        .then(() => batchUploadFiles())
        .catch(batchUploadFiles);
    }
    return Promise.resolve();
  };

  cilTips({});

  batchUploadFiles()
    .then(() => {
      const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
      return (
        refreshCdn && cdnHostName && refreshFiles(fileNames, mac, cdnHostName)
      );
    })
    .then(() => {
      finish({ callback });
    })
    .catch((err) => {
      console.log(err);
      finish({ callback, err });
    });
};

const configs = getConfigs();
console.log('---- configs ----\n');
console.log(_.omit(configs, ['accessKey', 'secretKey']));


const FILE_NAMES = glob
  .sync(`.${configs.BUILD_PATH}/**`, { nodir: true })
  .map((filename) => filename.replace(/^\.\//, ''));
execUpload(FILE_NAMES, configs);
