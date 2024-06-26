import shell from 'shelljs';
import { API } from 'ssm-shared-lib';
import { v4 as uuidv4 } from 'uuid';
import User from '../../data/database/model/User';
import AnsibleTaskRepo from '../../data/database/repository/AnsibleTaskRepo';
import DeviceAuthRepo from '../../data/database/repository/DeviceAuthRepo';
import logger from '../../logger';
import { DEFAULT_VAULT_ID, vaultEncrypt } from '../ansible-vault/vault';
import Inventory from '../ansible/transformers/InventoryTransformer';
import { Ansible } from '../../types/typings';
import ansibleCmd from '../ansible/AnsibleCmd';

export const ANSIBLE_PATH = '/server/src/ansible/';

async function executePlaybook(
  playbook: string,
  user: User,
  target?: string[],
  extraVars?: API.ExtraVars,
) {
  logger.info('[SHELL]-[ANSIBLE] - executePlaybook - Starting...');
  if (!playbook.endsWith('.yml')) {
    playbook += '.yml';
  }
  let inventoryTargets: Ansible.All & Ansible.HostGroups;
  if (target) {
    logger.info(`[SHELL]-[ANSIBLE] - executePlaybook - called with target: ${target}`);
    const devicesAuth = await DeviceAuthRepo.findManyByDevicesUuid(target);
    if (!devicesAuth) {
      logger.error(`[SHELL]-[ANSIBLE] - executePlaybook - Target not found`);
      throw new Error('Exec failed, no matching target');
    }
    inventoryTargets = Inventory.inventoryBuilderForTarget(devicesAuth);
  }
  shell.cd(ANSIBLE_PATH);
  shell.rm('/server/src/ansible/inventory/hosts');
  shell.rm('/server/src/ansible/env/_extravars');
  const uuid = uuidv4();
  shell.exec('ssh-add -l');
  const result = await new Promise<string | null>((resolve) => {
    const cmd = ansibleCmd.buildAnsibleCmd(playbook, uuid, inventoryTargets, user, extraVars);
    logger.info(`[SHELL]-[ANSIBLE] - executePlaybook - Executing ${cmd}`);
    const child = shell.exec(cmd, {
      async: true,
    });
    child.stdout?.on('data', function (data) {
      resolve(data);
    });
    child.on('exit', function () {
      resolve(null);
    });
  });
  logger.info('[SHELL]-[ANSIBLE] - executePlaybook - ended');
  if (result) {
    logger.info(`[SHELL]-[ANSIBLE] - executePlaybook - ExecId is ${uuid}`);
    await AnsibleTaskRepo.create({ ident: uuid, status: 'created', cmd: `playbook ${playbook}` });
    return result;
  } else {
    logger.error('[SHELL]-[ANSIBLE] - executePlaybook - Result was not properly set');
    throw new Error('Exec failed');
  }
}

async function listPlaybooks() {
  try {
    logger.info('[SHELL]-[ANSIBLE] - listPlaybook - Starting...');
    shell.cd(ANSIBLE_PATH);
    const listOfPlaybooks: string[] = [];
    shell.ls('*.yml').forEach(function (file) {
      listOfPlaybooks.push(file);
    });
    logger.info('[SHELL]-[ANSIBLE] - listPlaybook - ended');
    return listOfPlaybooks;
  } catch (error) {
    logger.error('[SHELL]-[ANSIBLE] - listPlaybook');
    throw new Error('listPlaybooks failed');
  }
}

async function readPlaybook(playbook: string) {
  try {
    logger.info(`[SHELL]-[ANSIBLE] - readPlaybook - ${playbook}  - Starting...`);
    shell.cd(ANSIBLE_PATH);
    return shell.cat(playbook).toString();
  } catch (error) {
    logger.error('[SHELL]-[ANSIBLE] - readPlaybook');
    throw new Error('readPlaybook failed');
  }
}

async function readPlaybookConfiguration(playbookConfigurationFile: string) {
  try {
    logger.info(
      `[SHELL]-[ANSIBLE] - readPlaybookConfiguration - ${playbookConfigurationFile} - Starting...`,
    );
    shell.cd(ANSIBLE_PATH);
    if (!shell.test('-f', ANSIBLE_PATH + playbookConfigurationFile)) {
      logger.info(`[SHELL]-[ANSIBLE] - readPlaybookConfiguration - not found`);
      return undefined;
    }
    return shell.cat(playbookConfigurationFile).toString();
  } catch (error) {
    logger.error('[SHELL]-[ANSIBLE] - readPlaybookConfiguration');
    throw new Error('readPlaybookConfiguration failed');
  }
}

async function editPlaybook(playbook: string, content: string) {
  try {
    logger.info('[SHELL]-[ANSIBLE] - editPlaybook - Starting...');
    shell.cd(ANSIBLE_PATH);
    shell.ShellString(content).to(playbook);
  } catch (error) {
    logger.error('[SHELL]-[ANSIBLE] - editPlaybook');
    throw new Error('editPlaybook failed');
  }
}

async function newPlaybook(playbook: string) {
  try {
    logger.info('[SHELL]-[ANSIBLE] - newPlaybook - Starting...');
    shell.cd(ANSIBLE_PATH);
    shell.touch(playbook + '.yml');
  } catch (error) {
    logger.error('[SHELL]-[ANSIBLE] - newPlaybook');
    throw new Error('newPlaybook failed');
  }
}

async function deletePlaybook(playbook: string) {
  try {
    logger.info('[SHELL]-[ANSIBLE] - newPlaybook - Starting...');
    shell.cd(ANSIBLE_PATH);
    shell.rm(playbook);
  } catch (error) {
    logger.error('[SHELL]-[ANSIBLE] - newPlaybook');
    throw new Error('deletePlaybook failed');
  }
}

async function getAnsibleVersion() {
  try {
    logger.info('[SHELL] - getAnsibleVersion - Starting...');
    return shell.exec('ansible --version').toString();
  } catch (error) {
    logger.error('[SHELL]- - getAnsibleVersion');
  }
}

async function vaultSshKey(key: string, uuid: string) {
  try {
    logger.info('[SHELL] - vaultSshKey Starting...');
    if (shell.exec(`echo '${key}' > /tmp/${uuid}.key`).code !== 0) {
      throw new Error('[SHELL] - vaultSshKey - Error creating tmp file');
    }
    if (shell.chmod(600, `/tmp/${uuid}.key`).code !== 0) {
      throw new Error('[SHELL] - vaultSshKey - Error chmoding file');
    }
  } catch (error) {
    logger.error('[SHELL] - vaultSshKey');
    throw error;
  }
}

export default {
  executePlaybook,
  listPlaybooks,
  readPlaybook,
  editPlaybook,
  newPlaybook,
  deletePlaybook,
  readPlaybookConfiguration,
  getAnsibleVersion,
  vaultSshKey,
};
