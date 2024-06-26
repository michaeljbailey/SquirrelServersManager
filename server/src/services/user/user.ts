import { GeneralSettingsKeys } from 'ssm-shared-lib/distribution/enums/settings';
import { AuthFailureError } from '../../core/api/ApiError';
import { SuccessResponse } from '../../core/api/ApiResponse';
import { getAnsibleVersion } from '../../core/system/version';
import { Role } from '../../data/database/model/User';
import UserRepo from '../../data/database/repository/UserRepo';
import { getIntConfFromCache } from '../../data/cache';
import asyncHandler from '../../helpers/AsyncHandler';
import logger from '../../logger';
import DashboardUseCase from '../../use-cases/DashboardUseCase';
import DeviceUseCases from '../../use-cases/DeviceUseCases';
import { dependencies, version } from '../../../package.json';

export const getCurrentUser = asyncHandler(async (req, res) => {
  logger.info(`[CONTROLLER] - GET - /currentUser ${req.user?.email}`);
  const { online, offline, totalCpu, totalMem, overview } =
    await DeviceUseCases.getDevicesOverview();
  const considerDeviceOffline = await getIntConfFromCache(
    GeneralSettingsKeys.CONSIDER_DEVICE_OFFLINE_AFTER_IN_MINUTES,
  );
  const serverLogRetention = await getIntConfFromCache(
    GeneralSettingsKeys.SERVER_LOG_RETENTION_IN_DAYS,
  );
  const containerStatsRetention = await getIntConfFromCache(
    GeneralSettingsKeys.CONTAINER_STATS_RETENTION_IN_DAYS,
  );
  const deviceStatsRetention = await getIntConfFromCache(
    GeneralSettingsKeys.DEVICE_STATS_RETENTION_IN_DAYS,
  );
  const ansibleLogRetention = await getIntConfFromCache(
    GeneralSettingsKeys.CLEAN_UP_ANSIBLE_STATUSES_AND_TASKS_AFTER_IN_SECONDS,
  );
  const performanceMinMem = await getIntConfFromCache(
    GeneralSettingsKeys.CONSIDER_PERFORMANCE_GOOD_MEM_IF_GREATER,
  );
  const performanceMaxCpu = await getIntConfFromCache(
    GeneralSettingsKeys.CONSIDER_PERFORMANCE_GOOD_CPU_IF_LOWER,
  );
  const registerDeviceStatEvery = await getIntConfFromCache(
    GeneralSettingsKeys.REGISTER_DEVICE_STAT_EVERY_IN_SECONDS,
  );
  const systemPerformance = await DashboardUseCase.getSystemPerformance();

  new SuccessResponse('Get current user', {
    name: req.user?.name,
    avatar: req.user?.avatar,
    email: req.user?.email,
    notifyCount: 12,
    unreadCount: 11,
    access: req.user?.role,
    devices: {
      online: online,
      offline: offline,
      totalCpu: totalCpu,
      totalMem: totalMem,
      overview: overview,
    },
    systemPerformance: {
      danger: systemPerformance.danger,
      message: systemPerformance.message,
    },
    settings: {
      userSpecific: {
        userLogsLevel: req.user?.logsLevel,
      },
      logs: {
        serverRetention: serverLogRetention,
        ansibleRetention: ansibleLogRetention,
      },
      stats: {
        deviceStatsRetention: deviceStatsRetention,
        containerStatsRetention: containerStatsRetention,
      },
      dashboard: {
        performance: {
          minMem: performanceMinMem,
          maxCpu: performanceMaxCpu,
        },
      },
      apiKey: req.user?.apiKey,
      device: {
        registerDeviceStatEvery: registerDeviceStatEvery,
        considerOffLineAfter: considerDeviceOffline,
      },
      server: {
        version: version,
        deps: dependencies,
        processes: process.versions,
        ansibleVersion: await getAnsibleVersion(),
      },
    },
  }).send(res);
});

export const createFirstUser = asyncHandler(async (req, res) => {
  logger.info('[CONTROLLER] - POST - /createFirstUser');
  const { email, password, name, avatar } = req.body;
  const hasUser = (await UserRepo.count()) > 0;
  if (hasUser) {
    throw new AuthFailureError('Your instance already has a user, you must first connect');
  }

  await UserRepo.create({
    email: email,
    password: password,
    name: name,
    role: Role.ADMIN,
    avatar: avatar || '/avatars/squirrel.svg',
  });
  new SuccessResponse('Create first user').send(res);
});

export const hasUser = asyncHandler(async (req, res) => {
  logger.info('[CONTROLLER] - GET - /hasUsers');
  const hasUser = (await UserRepo.count()) > 0;
  new SuccessResponse('Has user', { hasUsers: hasUser }).send(res);
});
