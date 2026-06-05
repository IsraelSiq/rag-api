import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { cors, handleOptions } from '../lib/helpers'

type SkillRequire = { skillId: string; level: number }

type SkillRow = {
  id: string
  name: string
  max_level: number
  type: 'active' | 'passive' | 'toggle'
  description: string
  element?: string
  job_id: string
  requires?: SkillRequire[]
}

const skills: SkillRow[] = [
  // ─── NOVICE ───────────────────────────────────────────────
  { id: 'nv_basic', name: 'Basic Skill', max_level: 9, type: 'passive', description: 'Habilidade básica de sobrevivência. Nível 6 permite trocar de classe. Nível 9 habilita o emote /sit.', job_id: 'novice' },
  { id: 'nv_firstaid', name: 'First Aid', max_level: 1, type: 'active', description: 'Recupera 5 HP imediatamente. Custo de 3 SP.', requires: [{ skillId: 'nv_basic', level: 3 }], job_id: 'novice' },
  { id: 'nv_emote', name: 'Trick Dead', max_level: 1, type: 'active', description: 'Finge estar morto para enganar monstros.', requires: [{ skillId: 'nv_basic', level: 5 }], job_id: 'novice' },

  // ─── SWORDMAN ─────────────────────────────────────────────
  { id: 'sm_bash', name: 'Bash', max_level: 10, type: 'active', description: 'Golpe físico poderoso com bônus de dano. Nível 5+ adiciona Stun.', job_id: 'swordman' },
  { id: 'sm_provoke', name: 'Provoke', max_level: 10, type: 'active', description: 'Aumenta ATK e DEF do alvo. Funciona em monstros e players.', job_id: 'swordman' },
  { id: 'sm_magnum', name: 'Magnum Break', max_level: 10, type: 'active', description: 'AoE de fogo ao redor do personagem. Aumenta ATK de fogo por 10s.', requires: [{ skillId: 'sm_bash', level: 5 }], job_id: 'swordman' },
  { id: 'sm_increase_hp', name: 'Increase HP Recovery', max_level: 10, type: 'passive', description: 'Aumenta a regeneração natural de HP.', job_id: 'swordman' },
  { id: 'sm_endure', name: 'Endure', max_level: 10, type: 'active', description: 'Imunidade a knockback e redução de MDEF por curta duração.', requires: [{ skillId: 'sm_provoke', level: 5 }], job_id: 'swordman' },
  { id: 'sm_hp_recovery_while_moving', name: 'HP Recovery While Moving', max_level: 10, type: 'passive', description: 'Permite regenerar HP mesmo em movimento.', requires: [{ skillId: 'sm_increase_hp', level: 5 }], job_id: 'swordman' },
  { id: 'sm_sword_mastery', name: 'Sword Mastery', max_level: 10, type: 'passive', description: '+4 ATK por nível com espadas.', job_id: 'swordman' },
  { id: 'sm_two_hand_mastery', name: 'Two-Handed Sword Mastery', max_level: 10, type: 'passive', description: '+4 ATK por nível com espadas de duas mãos.', job_id: 'swordman' },
  { id: 'sm_auto_berserk', name: 'Auto Berserk', max_level: 1, type: 'toggle', description: 'Ativa Provoke automaticamente ao ficar com menos de 25% HP.', requires: [{ skillId: 'sm_provoke', level: 1 }], job_id: 'swordman' },

  // ─── MAGE ─────────────────────────────────────────────────
  { id: 'mg_firebolt', name: 'Fire Bolt', max_level: 10, type: 'active', element: 'Fogo', description: 'Dispara projéteis de fogo no alvo.', job_id: 'mage' },
  { id: 'mg_coldbolt', name: 'Cold Bolt', max_level: 10, type: 'active', element: 'Água', description: 'Dispara projéteis de gelo no alvo.', job_id: 'mage' },
  { id: 'mg_lightningbolt', name: 'Lightning Bolt', max_level: 10, type: 'active', element: 'Vento', description: 'Dispara raios no alvo.', job_id: 'mage' },
  { id: 'mg_sonicblow', name: 'Soul Strike', max_level: 10, type: 'active', element: 'Fantasma', description: 'Golpe espiritual. Extra dano em mortos-vivos.', job_id: 'mage' },
  { id: 'mg_napalmbeat', name: 'Napalm Beat', max_level: 10, type: 'active', element: 'Fantasma', description: 'Explosão de fogo espiritual AoE.', job_id: 'mage' },
  { id: 'mg_sight', name: 'Sight', max_level: 1, type: 'active', description: 'Revela inimigos invisíveis ao redor.', job_id: 'mage' },
  { id: 'mg_safetywall', name: 'Safety Wall', max_level: 10, type: 'active', description: 'Cria barreira que bloqueia ataques físicos.', requires: [{ skillId: 'mg_sonicblow', level: 5 }], job_id: 'mage' },
  { id: 'mg_stonecurse', name: 'Stone Curse', max_level: 10, type: 'active', description: 'Tenta petrificar o alvo.', requires: [{ skillId: 'mg_sight', level: 1 }], job_id: 'mage' },
  { id: 'mg_energycoat', name: 'Energy Coat', max_level: 1, type: 'toggle', description: 'Usa SP para absorver dano físico.', requires: [{ skillId: 'mg_napalmbeat', level: 7 }, { skillId: 'mg_safetywall', level: 1 }], job_id: 'mage' },
  { id: 'mg_increase_sp', name: 'Increase SP Recovery', max_level: 10, type: 'passive', description: 'Aumenta regeneração natural de SP.', job_id: 'mage' },

  // ─── ARCHER ───────────────────────────────────────────────
  { id: 'ac_owl_eye', name: "Owl's Eye", max_level: 10, type: 'passive', description: '+1 DEX por nível.', job_id: 'archer' },
  { id: 'ac_vulture_eye', name: "Vulture's Eye", max_level: 10, type: 'passive', description: '+1 de alcance e +1 HIT por nível.', requires: [{ skillId: 'ac_owl_eye', level: 3 }], job_id: 'archer' },
  { id: 'ac_double_strafe', name: 'Double Strafe', max_level: 10, type: 'active', description: 'Dispara dois projéteis de alta precisão.', requires: [{ skillId: 'ac_owl_eye', level: 5 }], job_id: 'archer' },
  { id: 'ac_arrow_shower', name: 'Arrow Shower', max_level: 10, type: 'active', description: 'AoE de flechas em área 5x5.', requires: [{ skillId: 'ac_double_strafe', level: 5 }], job_id: 'archer' },
  { id: 'ac_improve_conc', name: 'Improve Concentration', max_level: 10, type: 'active', description: 'Aumenta DEX e AGI. Revela inimigos ocultos próximos.', requires: [{ skillId: 'ac_owl_eye', level: 5 }, { skillId: 'ac_vulture_eye', level: 5 }], job_id: 'archer' },
  { id: 'ac_arrow_crafting', name: 'Arrow Crafting', max_level: 1, type: 'active', description: 'Cria flechas a partir de materiais.', job_id: 'archer' },
  { id: 'ac_charge_arrow', name: 'Charge Arrow', max_level: 1, type: 'active', description: 'Flecha que empurra o alvo a longa distância.', requires: [{ skillId: 'ac_double_strafe', level: 5 }], job_id: 'archer' },

  // ─── MERCHANT ─────────────────────────────────────────────
  { id: 'mc_discount', name: 'Discount', max_level: 10, type: 'passive', description: 'Reduz o preço de compra em NPCs em até 24%.', job_id: 'merchant' },
  { id: 'mc_overcharge', name: 'Overcharge', max_level: 10, type: 'passive', description: 'Aumenta o preço de venda para NPCs em até 24%.', job_id: 'merchant' },
  { id: 'mc_pushcart', name: 'Pushcart', max_level: 10, type: 'passive', description: 'Habilita o uso do carrinho de compras. Cada nível aumenta o peso máximo carregável.', job_id: 'merchant' },
  { id: 'mc_vending', name: 'Vending', max_level: 10, type: 'active', description: 'Abre uma loja para vender itens do carrinho para outros jogadores.', requires: [{ skillId: 'mc_pushcart', level: 3 }], job_id: 'merchant' },
  { id: 'mc_identify', name: 'Identify', max_level: 1, type: 'active', description: 'Identifica itens sem precisar de Magnifier. Custo de 10 SP.', job_id: 'merchant' },
  { id: 'mc_loud', name: 'Loud Exclamation', max_level: 1, type: 'active', description: 'Aumenta STR em 4 por 60 segundos.', requires: [{ skillId: 'mc_discount', level: 1 }], job_id: 'merchant' },
  { id: 'mc_mammonite', name: 'Mammonite', max_level: 10, type: 'active', description: 'Golpe físico que consome Zeny para causar dano massivo.', requires: [{ skillId: 'mc_loud', level: 1 }], job_id: 'merchant' },
  { id: 'mc_enlarge_weight', name: 'Enlarge Weight Limit', max_level: 10, type: 'passive', description: 'Aumenta o limite de peso do personagem em 200 por nível.', job_id: 'merchant' },
  { id: 'mc_male', name: 'Item Appraisal', max_level: 1, type: 'active', description: 'Identifica um item selecionado no inventário.', requires: [{ skillId: 'mc_identify', level: 1 }], job_id: 'merchant' },
  { id: 'mc_cartrevolution', name: 'Cart Revolution', max_level: 1, type: 'active', description: 'AoE físico usando o carrinho. Empurra inimigos. Dano baseado no peso do carrinho.', requires: [{ skillId: 'mc_pushcart', level: 5 }], job_id: 'merchant' },

  // ─── THIEF ────────────────────────────────────────────────
  { id: 'th_steal', name: 'Steal', max_level: 10, type: 'active', description: 'Rouba item do inventário de monstro.', job_id: 'thief' },
  { id: 'th_hiding', name: 'Hiding', max_level: 10, type: 'active', description: 'Torna o personagem invisível.', requires: [{ skillId: 'th_steal', level: 5 }], job_id: 'thief' },
  { id: 'th_backstab', name: 'Back Stab', max_level: 10, type: 'active', description: 'Dano massivo pelas costas. Só funciona no ângulo correto.', requires: [{ skillId: 'th_hiding', level: 5 }], job_id: 'thief' },
  { id: 'th_pickpocket', name: 'Pick Pocket', max_level: 10, type: 'active', description: 'Rouba Zeny de players.', requires: [{ skillId: 'th_steal', level: 3 }], job_id: 'thief' },
  { id: 'th_sprinkle_sand', name: 'Sprinkle Sand', max_level: 5, type: 'active', description: 'Aplica cegueira no alvo.', job_id: 'thief' },
  { id: 'th_sand_attack', name: 'Sand Attack', max_level: 10, type: 'active', element: 'Terra', description: 'Ataque com elemento terra.', requires: [{ skillId: 'th_sprinkle_sand', level: 2 }], job_id: 'thief' },
  { id: 'th_double_attack', name: 'Double Attack', max_level: 10, type: 'passive', description: 'Chance de atacar duas vezes com adaga.', job_id: 'thief' },
  { id: 'th_lucky_dodge', name: 'Lucky Dodge', max_level: 10, type: 'passive', description: '+1 FLEE por nível.', job_id: 'thief' },
  { id: 'th_envenom', name: 'Envenom', max_level: 10, type: 'active', element: 'Veneno', description: 'Ataque envenenado com chance de aplicar status.', job_id: 'thief' },
  { id: 'th_poison_react', name: 'Poison React', max_level: 10, type: 'active', description: 'Contra-ataque quando envenenado.', requires: [{ skillId: 'th_envenom', level: 5 }], job_id: 'thief' },

  // ─── ACOLYTE ──────────────────────────────────────────────
  { id: 'al_heal', name: 'Heal', max_level: 10, type: 'active', element: 'Sagrado', description: 'Cura HP de aliados ou causa dano em mortos-vivos.', job_id: 'acolyte' },
  { id: 'al_incagi', name: 'Increase AGI', max_level: 10, type: 'active', description: 'Aumenta AGI e velocidade de movimento do alvo.', requires: [{ skillId: 'al_heal', level: 3 }], job_id: 'acolyte' },
  { id: 'al_decagi', name: 'Decrease AGI', max_level: 10, type: 'active', description: 'Reduz AGI e velocidade de movimento do alvo.', requires: [{ skillId: 'al_heal', level: 3 }], job_id: 'acolyte' },
  { id: 'al_ruwach', name: 'Ruwach', max_level: 1, type: 'active', element: 'Sagrado', description: 'Revela e causa dano em inimigos invisíveis ao redor.', job_id: 'acolyte' },
  { id: 'al_pneuma', name: 'Pneuma', max_level: 1, type: 'active', description: 'Cria campo que bloqueia projéteis físicos por 10 segundos.', requires: [{ skillId: 'al_ruwach', level: 1 }], job_id: 'acolyte' },
  { id: 'al_warp', name: 'Warp Portal', max_level: 4, type: 'active', description: 'Abre portal de teletransporte para mapas salvos.', requires: [{ skillId: 'al_heal', level: 3 }], job_id: 'acolyte' },
  { id: 'al_teleport', name: 'Teleport', max_level: 2, type: 'active', description: 'Nível 1: teletransporta aleatoriamente. Nível 2: teletransporta para save point.', job_id: 'acolyte' },
  { id: 'al_blessing', name: 'Blessing', max_level: 10, type: 'active', element: 'Sagrado', description: 'Aumenta STR, INT e DEX do alvo. Remove status Curse e Stone.', requires: [{ skillId: 'al_heal', level: 5 }], job_id: 'acolyte' },
  { id: 'al_demonbane', name: 'Demon Bane', max_level: 10, type: 'passive', description: '+3 ATK contra Demônios e Mortos-Vivos por nível.', job_id: 'acolyte' },
  { id: 'al_holylight', name: 'Holy Light', max_level: 1, type: 'active', element: 'Sagrado', description: 'Projétil sagrado de dano único.', requires: [{ skillId: 'al_demonbane', level: 5 }], job_id: 'acolyte' },
  { id: 'al_divine_prot', name: 'Divine Protection', max_level: 10, type: 'passive', description: '+3 DEF contra Demônios e Mortos-Vivos por nível.', job_id: 'acolyte' },

  // ─── KNIGHT ───────────────────────────────────────────────
  { id: 'kn_pierce', name: 'Pierce', max_level: 10, type: 'active', description: 'Perfura o alvo múltiplas vezes com lança. Dano extra em monstros grandes.', job_id: 'knight' },
  { id: 'kn_twohand_quicken', name: 'Two-Hand Quicken', max_level: 10, type: 'active', description: 'Aumenta ASPD usando espada de duas mãos por 300s.', job_id: 'knight' },
  { id: 'kn_onehand_quicken', name: 'One-Hand Quicken', max_level: 1, type: 'active', description: 'Aumenta ASPD com espada de uma mão por 30s.', requires: [{ skillId: 'kn_twohand_quicken', level: 3 }], job_id: 'knight' },
  { id: 'kn_brandish_spear', name: 'Brandish Spear', max_level: 10, type: 'active', description: 'AoE em cone com lança.', requires: [{ skillId: 'kn_pierce', level: 3 }], job_id: 'knight' },
  { id: 'kn_spear_stab', name: 'Spear Stab', max_level: 10, type: 'active', description: 'Empurra inimigos em linha reta com lança.', requires: [{ skillId: 'kn_pierce', level: 5 }], job_id: 'knight' },
  { id: 'kn_spear_boomerang', name: 'Spear Boomerang', max_level: 5, type: 'active', description: 'Arremessa lança a longa distância.', requires: [{ skillId: 'kn_spear_stab', level: 3 }], job_id: 'knight' },
  { id: 'kn_spear_mastery', name: 'Spear Mastery', max_level: 10, type: 'passive', description: '+4 ATK por nível com lanças.', job_id: 'knight' },
  { id: 'kn_cavalry_mastery', name: 'Cavalry Mastery', max_level: 5, type: 'passive', description: 'Reduz penalidade de ASPD ao usar Pecopeco.', job_id: 'knight' },
  { id: 'kn_bowling_bash', name: 'Bowling Bash', max_level: 10, type: 'active', description: 'Golpe AoE que empurra inimigos. Principal skill de leveling.', requires: [{ skillId: 'sm_bash', level: 9 }, { skillId: 'kn_twohand_quicken', level: 1 }], job_id: 'knight' },
  { id: 'kn_concentration', name: 'Concentration', max_level: 5, type: 'active', description: 'Aumenta ATK e HIT temporariamente, reduz DEF.', job_id: 'knight' },
  { id: 'kn_charge_attack', name: 'Charge Attack', max_level: 1, type: 'active', description: 'Teletransporta para o alvo e causa dano.', job_id: 'knight' },

  // ─── CRUSADER ─────────────────────────────────────────────
  { id: 'cr_holy_cross', name: 'Holy Cross', max_level: 10, type: 'active', element: 'Sagrado', description: 'Golpe sagrado duplo com espada. Pode causar Blind.', job_id: 'crusader' },
  { id: 'cr_grand_cross', name: 'Grand Cross', max_level: 10, type: 'active', element: 'Sagrado', description: 'AoE sagrado em forma de cruz ao redor do caster.', requires: [{ skillId: 'cr_holy_cross', level: 6 }], job_id: 'crusader' },
  { id: 'cr_devotion', name: 'Devotion', max_level: 5, type: 'active', description: 'Transfere o dano recebido por aliados para si mesmo.', job_id: 'crusader' },
  { id: 'cr_providence', name: 'Providence', max_level: 5, type: 'active', description: 'Aumenta resistência a Sagrado e Demônios de aliado.', requires: [{ skillId: 'cr_devotion', level: 3 }], job_id: 'crusader' },
  { id: 'cr_shieldboomerang', name: 'Shield Boomerang', max_level: 5, type: 'active', description: 'Arremessa o escudo no alvo causando dano à distância.', job_id: 'crusader' },
  { id: 'cr_shieldcharge', name: 'Shield Charge', max_level: 5, type: 'active', description: 'Avança com o escudo causando dano e Stun no alvo.', requires: [{ skillId: 'cr_shieldboomerang', level: 3 }], job_id: 'crusader' },
  { id: 'cr_spear_quicken', name: 'Spear Quicken', max_level: 10, type: 'active', description: 'Aumenta ASPD, ATK e CRI com lanças.', requires: [{ skillId: 'cr_holy_cross', level: 3 }], job_id: 'crusader' },
  { id: 'cr_reflectshield', name: 'Reflect Shield', max_level: 10, type: 'toggle', description: 'Reflete parte do dano físico recebido de volta ao atacante.', requires: [{ skillId: 'cr_shieldboomerang', level: 1 }], job_id: 'crusader' },
  { id: 'cr_autoguard', name: 'Auto Guard', max_level: 10, type: 'toggle', description: 'Chance de bloquear automaticamente ataques físicos com escudo.', job_id: 'crusader' },
  { id: 'cr_defender', name: 'Defender', max_level: 5, type: 'active', description: 'Aumenta DEF e MDEF mas reduz velocidade e ASPD.', requires: [{ skillId: 'cr_autoguard', level: 5 }], job_id: 'crusader' },
  { id: 'cr_shrink', name: 'Shrink', max_level: 1, type: 'toggle', description: 'Chance de empurrar inimigos ao bloquear com Auto Guard.', requires: [{ skillId: 'cr_autoguard', level: 5 }], job_id: 'crusader' },
  { id: 'cr_endure', name: 'Faith', max_level: 10, type: 'passive', description: 'Aumenta HP máximo e resistência a elemento Sagrado.', job_id: 'crusader' },

  // ─── WIZARD ───────────────────────────────────────────────
  { id: 'wz_firebolt', name: 'Fire Bolt', max_level: 10, type: 'active', element: 'Fogo', description: 'Projétil de fogo que causa dano mágico.', requires: [{ skillId: 'mg_firebolt', level: 4 }], job_id: 'wizard' },
  { id: 'wz_firewall', name: 'Fire Wall', max_level: 10, type: 'active', element: 'Fogo', description: 'Cria parede de fogo no chão.', requires: [{ skillId: 'wz_firebolt', level: 5 }], job_id: 'wizard' },
  { id: 'wz_firepillar', name: 'Fire Pillar', max_level: 10, type: 'active', element: 'Fogo', description: 'Cria armadilha de fogo no solo.', requires: [{ skillId: 'wz_firewall', level: 5 }], job_id: 'wizard' },
  { id: 'wz_iceneedle', name: 'Ice Bolt', max_level: 10, type: 'active', element: 'Água', description: 'Projétil de gelo. Pode congelar o alvo.', requires: [{ skillId: 'mg_coldbolt', level: 4 }], job_id: 'wizard' },
  { id: 'wz_frostnova', name: 'Frost Nova', max_level: 10, type: 'active', element: 'Água', description: 'Congela todos os inimigos ao redor.', requires: [{ skillId: 'wz_iceneedle', level: 5 }], job_id: 'wizard' },
  { id: 'wz_stormgust', name: 'Storm Gust', max_level: 10, type: 'active', element: 'Água', description: 'AoE de gelo poderoso. Pode congelar em acertos múltiplos.', requires: [{ skillId: 'wz_frostnova', level: 5 }, { skillId: 'wz_iceneedle', level: 8 }], job_id: 'wizard' },
  { id: 'wz_thunderstorm', name: 'Thunder Storm', max_level: 10, type: 'active', element: 'Vento', description: 'Chuva de raios AoE.', requires: [{ skillId: 'mg_lightningbolt', level: 4 }], job_id: 'wizard' },
  { id: 'wz_jupitel', name: 'Jupitel Thunder', max_level: 10, type: 'active', element: 'Vento', description: 'Raio que empurra o alvo.', requires: [{ skillId: 'wz_thunderstorm', level: 5 }], job_id: 'wizard' },
  { id: 'wz_lord_of_vermillion', name: 'Lord of Vermillion', max_level: 10, type: 'active', element: 'Vento', description: 'AoE de raios extremamente poderoso.', requires: [{ skillId: 'wz_jupitel', level: 5 }, { skillId: 'wz_thunderstorm', level: 8 }], job_id: 'wizard' },
  { id: 'wz_earthspike', name: 'Earth Spike', max_level: 5, type: 'active', element: 'Terra', description: 'Espigões de terra atingem o alvo.', job_id: 'wizard' },
  { id: 'wz_heavens_drive', name: "Heaven's Drive", max_level: 5, type: 'active', element: 'Terra', description: 'AoE de terra.', requires: [{ skillId: 'wz_earthspike', level: 3 }], job_id: 'wizard' },
  { id: 'wz_meteor_storm', name: 'Meteor Storm', max_level: 10, type: 'active', description: 'Chuva de meteoros AoE. Pode causar Stun.', requires: [{ skillId: 'wz_heavens_drive', level: 3 }, { skillId: 'wz_firepillar', level: 5 }], job_id: 'wizard' },
  { id: 'wz_quagmire', name: 'Quagmire', max_level: 5, type: 'active', description: 'Cria lama que reduz AGI e VIT dos alvos.', job_id: 'wizard' },
  { id: 'wz_sightrasher', name: 'Sightrasher', max_level: 10, type: 'active', description: 'Expulsa inimigos invisíveis e os empurra.', requires: [{ skillId: 'mg_sight', level: 1 }], job_id: 'wizard' },
  { id: 'wz_napalm_vulcan', name: 'Napalm Vulcan', max_level: 5, type: 'active', element: 'Fogo', description: 'Explosão de fogo em cadeia.', requires: [{ skillId: 'mg_napalmbeat', level: 7 }], job_id: 'wizard' },

  // ─── SAGE ─────────────────────────────────────────────────
  { id: 'sa_spellbreaker', name: 'Spell Breaker', max_level: 5, type: 'active', description: 'Interrompe o cast de um alvo e absorve seu SP.', job_id: 'sage' },
  { id: 'sa_magicrod', name: 'Magic Rod', max_level: 5, type: 'active', description: 'Absorve magia direcionada ao caster e converte em SP.', job_id: 'sage' },
  { id: 'sa_freecast', name: 'Free Cast', max_level: 10, type: 'passive', description: 'Permite mover-se e atacar durante o cast de magias.', job_id: 'sage' },
  { id: 'sa_autospell', name: 'Auto Spell', max_level: 10, type: 'toggle', description: 'Chance de conjurar automaticamente magia aprendida ao atacar.', requires: [{ skillId: 'sa_freecast', level: 5 }], job_id: 'sage' },
  { id: 'sa_castcancel', name: 'Cast Cancel', max_level: 5, type: 'active', description: 'Cancela o cast atual sem perder o SP.', requires: [{ skillId: 'sa_magicrod', level: 1 }], job_id: 'sage' },
  { id: 'sa_landprotector', name: 'Land Protector', max_level: 5, type: 'active', description: 'Cria área que bloqueia skills de terreno e magias direcionadas ao solo.', requires: [{ skillId: 'sa_spellbreaker', level: 1 }, { skillId: 'sa_magicrod', level: 1 }], job_id: 'sage' },
  { id: 'sa_volcano', name: 'Volcano', max_level: 5, type: 'active', element: 'Fogo', description: 'Encanta área do chão com Fogo.', job_id: 'sage' },
  { id: 'sa_deluge', name: 'Deluge', max_level: 5, type: 'active', element: 'Água', description: 'Encanta área com Água.', job_id: 'sage' },
  { id: 'sa_violentgale', name: 'Violent Gale', max_level: 5, type: 'active', element: 'Vento', description: 'Encanta área com Vento.', job_id: 'sage' },
  { id: 'sa_dispell', name: 'Dispell', max_level: 5, type: 'active', description: 'Remove buffs do alvo.', requires: [{ skillId: 'sa_spellbreaker', level: 3 }], job_id: 'sage' },
  { id: 'sa_elementalchange', name: 'Elemental Change', max_level: 1, type: 'active', description: 'Altera o elemento de um monstro alvo.', requires: [{ skillId: 'sa_volcano', level: 1 }, { skillId: 'sa_deluge', level: 1 }, { skillId: 'sa_violentgale', level: 1 }], job_id: 'sage' },
  { id: 'sa_sense', name: 'Sense', max_level: 1, type: 'active', description: 'Exibe informações detalhadas do monstro para o grupo.', job_id: 'sage' },

  // ─── HUNTER ───────────────────────────────────────────────
  { id: 'ht_blitzbeat', name: 'Blitz Beat', max_level: 5, type: 'active', description: 'Ataque de falcão AoE.', job_id: 'hunter' },
  { id: 'ht_steelcrow', name: 'Steel Crow', max_level: 10, type: 'passive', description: 'Aumenta o dano do Blitz Beat.', requires: [{ skillId: 'ht_blitzbeat', level: 3 }], job_id: 'hunter' },
  { id: 'ht_skidtrap', name: 'Skid Trap', max_level: 5, type: 'active', description: 'Armadilha que empurra o alvo.', job_id: 'hunter' },
  { id: 'ht_anklesnare', name: 'Ankle Snare', max_level: 5, type: 'active', description: 'Armadilha que imobiliza o alvo.', requires: [{ skillId: 'ht_skidtrap', level: 1 }], job_id: 'hunter' },
  { id: 'ht_sandman', name: 'Sandman', max_level: 5, type: 'active', description: 'Armadilha que adormece o alvo.', requires: [{ skillId: 'ht_anklesnare', level: 1 }], job_id: 'hunter' },
  { id: 'ht_flasher', name: 'Flasher', max_level: 5, type: 'active', description: 'Armadilha que cega o alvo.', requires: [{ skillId: 'ht_sandman', level: 1 }], job_id: 'hunter' },
  { id: 'ht_freezingtrap', name: 'Freezing Trap', max_level: 5, type: 'active', element: 'Água', description: 'Armadilha que congela o alvo.', requires: [{ skillId: 'ht_sandman', level: 1 }], job_id: 'hunter' },
  { id: 'ht_blastmine', name: 'Blast Mine', max_level: 5, type: 'active', element: 'Vento', description: 'Armadilha explosiva de vento.', requires: [{ skillId: 'ht_freezingtrap', level: 1 }], job_id: 'hunter' },
  { id: 'ht_claymore', name: 'Claymore Trap', max_level: 5, type: 'active', element: 'Fogo', description: 'Armadilha explosiva de fogo AoE poderosa.', requires: [{ skillId: 'ht_blastmine', level: 1 }], job_id: 'hunter' },
  { id: 'ht_remove_trap', name: 'Remove Trap', max_level: 1, type: 'active', description: 'Remove armadilha do chão.', requires: [{ skillId: 'ht_skidtrap', level: 1 }], job_id: 'hunter' },
  { id: 'ht_detecting', name: 'Detecting', max_level: 4, type: 'active', description: 'Revela armadilhas e inimigos invisíveis.', job_id: 'hunter' },
  { id: 'ht_power_thrust', name: 'Beast Mastery', max_level: 5, type: 'passive', description: 'Aumenta dano de Blitz Beat e ataques com falcão.', requires: [{ skillId: 'ht_blitzbeat', level: 5 }], job_id: 'hunter' },
  { id: 'ht_phantasmic', name: 'Phantasmic Arrow', max_level: 10, type: 'active', description: 'Flecha mágica que ignora parte da DEF.', requires: [{ skillId: 'ac_double_strafe', level: 5 }], job_id: 'hunter' },

  // ─── BARD ─────────────────────────────────────────────────
  { id: 'ba_musicalstrike', name: 'Musical Strike', max_level: 10, type: 'active', description: 'Ataque à distância com instrumento. Pode causar Stun.', job_id: 'bard' },
  { id: 'ba_dissonance', name: 'Dissonance', max_level: 5, type: 'active', description: 'Área de dano contínuo pelo som.', requires: [{ skillId: 'ba_musicalstrike', level: 3 }], job_id: 'bard' },
  { id: 'ba_whistle', name: 'Whistle', max_level: 10, type: 'active', description: 'Música que aumenta Flee e ASPD de aliados na área.', job_id: 'bard' },
  { id: 'ba_assassincross', name: 'Assassin Cross of Sunset', max_level: 10, type: 'active', description: 'Música que aumenta ASPD de todos na área.', requires: [{ skillId: 'ba_whistle', level: 5 }], job_id: 'bard' },
  { id: 'ba_poembragi', name: 'Poem of Bragi', max_level: 10, type: 'active', description: 'Música que reduz tempo de cast e delay de aliados. Essencial em PvM.', requires: [{ skillId: 'ba_whistle', level: 3 }], job_id: 'bard' },
  { id: 'ba_apple', name: 'Apple of Idun', max_level: 10, type: 'active', description: 'Música que aumenta HP máximo e regeneração de HP de aliados.', requires: [{ skillId: 'ba_poembragi', level: 3 }], job_id: 'bard' },
  { id: 'ba_encore', name: 'Encore', max_level: 1, type: 'active', description: 'Repete a última música usada com metade do custo de SP.', job_id: 'bard' },
  { id: 'ba_guitar_mastery', name: 'Music Lessons', max_level: 10, type: 'passive', description: 'Aumenta ATK com instrumentos e potência de todas as músicas.', job_id: 'bard' },
  { id: 'ba_pangvoice', name: 'Pang Voice', max_level: 1, type: 'active', description: 'Causa Confusion no alvo.', requires: [{ skillId: 'ba_musicalstrike', level: 5 }], job_id: 'bard' },

  // ─── DANCER ───────────────────────────────────────────────
  { id: 'dc_throwarrow', name: 'Throw Arrow', max_level: 10, type: 'active', description: 'Ataque à distância com flechas.', job_id: 'dancer' },
  { id: 'dc_scream', name: 'Scream', max_level: 5, type: 'active', description: 'Grito que causa Frenzy no alvo.', requires: [{ skillId: 'dc_throwarrow', level: 3 }], job_id: 'dancer' },
  { id: 'dc_winkcharm', name: 'Wink of Charm', max_level: 10, type: 'active', description: 'Encanta monstro humanoide para seguir a Dancer.', job_id: 'dancer' },
  { id: 'dc_dontforgetme', name: "Don't Forget Me", max_level: 10, type: 'active', description: 'Dança que reduz ASPD e velocidade de inimigos na área.', requires: [{ skillId: 'dc_winkcharm', level: 3 }], job_id: 'dancer' },
  { id: 'dc_fortunekiss', name: 'Fortune Kiss', max_level: 10, type: 'active', description: 'Dança que aumenta CRIT e LUCK de aliados na área.', requires: [{ skillId: 'dc_winkcharm', level: 3 }], job_id: 'dancer' },
  { id: 'dc_serviceforyou', name: 'Service for You', max_level: 10, type: 'active', description: 'Dança que aumenta SP máximo e reduz consumo de SP de aliados.', requires: [{ skillId: 'dc_fortunekiss', level: 3 }], job_id: 'dancer' },
  { id: 'dc_humming', name: 'Humming', max_level: 10, type: 'active', description: 'Dança que aumenta HIT de aliados na área.', job_id: 'dancer' },
  { id: 'dc_encore', name: 'Encore', max_level: 1, type: 'active', description: 'Repete a última dança usada com metade do custo de SP.', job_id: 'dancer' },
  { id: 'dc_dance_lessons', name: 'Dance Lessons', max_level: 10, type: 'passive', description: 'Aumenta ATK com instrumentos e potência de todas as danças.', job_id: 'dancer' },

  // ─── BLACKSMITH ───────────────────────────────────────────
  { id: 'bs_adrenaline', name: 'Adrenaline Rush', max_level: 5, type: 'active', description: 'Aumenta ASPD com machados para o caster e aliados.', job_id: 'blacksmith' },
  { id: 'bs_weaponperfect', name: 'Weapon Perfection', max_level: 5, type: 'active', description: 'Remove penalidade de tamanho do monstro.', requires: [{ skillId: 'bs_adrenaline', level: 3 }], job_id: 'blacksmith' },
  { id: 'bs_overthrust', name: 'Overthrust', max_level: 5, type: 'active', description: 'Aumenta ATK do caster e aliados em até 20%.', requires: [{ skillId: 'bs_weaponperfect', level: 3 }], job_id: 'blacksmith' },
  { id: 'bs_hammerfall', name: 'Hammerfall', max_level: 5, type: 'active', description: 'AoE ao redor do caster com chance de causar Stun.', requires: [{ skillId: 'bs_adrenaline', level: 2 }], job_id: 'blacksmith' },
  { id: 'bs_hiltbinding', name: 'Hilt Binding', max_level: 1, type: 'passive', description: 'Aumenta ATK e duração de Adrenaline Rush e Overthrust.', job_id: 'blacksmith' },
  { id: 'bs_oridecon', name: 'Ore Discovery', max_level: 1, type: 'passive', description: 'Aumenta chance de monstros droparem minérios.', job_id: 'blacksmith' },
  { id: 'bs_enchantedstone', name: 'Enchanted Stone Craft', max_level: 5, type: 'passive', description: 'Permite criar gemas elementais encantadas.', requires: [{ skillId: 'bs_oridecon', level: 1 }], job_id: 'blacksmith' },
  { id: 'bs_iron', name: 'Iron Tempering', max_level: 5, type: 'passive', description: 'Aumenta chance de sucesso na forja de armas de ferro.', job_id: 'blacksmith' },
  { id: 'bs_steel', name: 'Steel Tempering', max_level: 5, type: 'passive', description: 'Aumenta chance de sucesso na forja de armas de aço.', requires: [{ skillId: 'bs_iron', level: 3 }], job_id: 'blacksmith' },
  { id: 'bs_weaponresearch', name: 'Weapon Research', max_level: 10, type: 'passive', description: 'Aumenta HIT e ATK passivamente.', job_id: 'blacksmith' },
  { id: 'bs_skintemper', name: 'Skin Tempering', max_level: 5, type: 'passive', description: 'Aumenta resistência a Fogo e dano neutro.', job_id: 'blacksmith' },
  { id: 'bs_axe_mastery', name: 'Axe Mastery', max_level: 10, type: 'passive', description: '+3 ATK por nível com machados.', job_id: 'blacksmith' },

  // ─── ALCHEMIST ────────────────────────────────────────────
  { id: 'am_pharmacy', name: 'Pharmacy', max_level: 10, type: 'active', description: 'Permite criar poções de HP e SP.', job_id: 'alchemist' },
  { id: 'am_demonstration', name: 'Demonstration', max_level: 5, type: 'active', element: 'Fogo', description: 'Arremessa bomba de Fogo em AoE.', requires: [{ skillId: 'am_pharmacy', level: 3 }], job_id: 'alchemist' },
  { id: 'am_acidterror', name: 'Acid Terror', max_level: 5, type: 'active', description: 'Arremessa ácido que pode destruir armadura do alvo.', requires: [{ skillId: 'am_pharmacy', level: 5 }], job_id: 'alchemist' },
  { id: 'am_callhomun', name: 'Call Homunculus', max_level: 1, type: 'active', description: 'Invoca o Homunculus.', job_id: 'alchemist' },
  { id: 'am_resurrecthomun', name: 'Resurrect Homunculus', max_level: 5, type: 'active', description: 'Ressuscita o Homunculus com parte do HP.', requires: [{ skillId: 'am_callhomun', level: 1 }], job_id: 'alchemist' },
  { id: 'am_biotechnology', name: 'Biotechnology', max_level: 5, type: 'passive', description: 'Aumenta chance de sucesso na criação de Homunculus.', job_id: 'alchemist' },
  { id: 'am_compounding', name: 'Compounding', max_level: 10, type: 'passive', description: 'Permite criar itens compostos especiais.', job_id: 'alchemist' },
  { id: 'am_potionpitcher', name: 'Potion Pitcher', max_level: 5, type: 'active', description: 'Arremessa poção de cura em aliado à distância.', requires: [{ skillId: 'am_pharmacy', level: 3 }], job_id: 'alchemist' },
  { id: 'am_creatematerial', name: 'Prepare Potion', max_level: 10, type: 'passive', description: 'Aumenta a efetividade das poções produzidas.', requires: [{ skillId: 'am_pharmacy', level: 5 }], job_id: 'alchemist' },
  { id: 'am_spheremine', name: 'Sphere Mine', max_level: 5, type: 'active', description: 'Planta esfera explosiva no chão.', requires: [{ skillId: 'am_demonstration', level: 3 }], job_id: 'alchemist' },

  // ─── ASSASSIN ─────────────────────────────────────────────
  { id: 'as_sonicblow', name: 'Sonic Blow', max_level: 10, type: 'active', description: 'Série de 8 golpes rápidos. Principal skill de dano do Assassin.', requires: [{ skillId: 'th_double_attack', level: 5 }], job_id: 'assassin' },
  { id: 'as_grimtooth', name: 'Grimtooth', max_level: 5, type: 'active', description: 'Ataque com garra de escuridão. Usável em Hiding.', requires: [{ skillId: 'th_hiding', level: 5 }], job_id: 'assassin' },
  { id: 'as_enchant_poison', name: 'Enchant Poison', max_level: 10, type: 'active', element: 'Veneno', description: 'Encha a arma com veneno temporariamente.', requires: [{ skillId: 'th_envenom', level: 5 }], job_id: 'assassin' },
  { id: 'as_poison_react', name: 'Poison React', max_level: 10, type: 'active', description: 'Contra-ataque automático quando envenenado.', requires: [{ skillId: 'as_enchant_poison', level: 3 }], job_id: 'assassin' },
  { id: 'as_venom_dust', name: 'Venom Dust', max_level: 10, type: 'active', element: 'Veneno', description: 'Cria nuvem venenosa no chão.', requires: [{ skillId: 'as_enchant_poison', level: 5 }], job_id: 'assassin' },
  { id: 'as_venom_splasher', name: 'Venom Splasher', max_level: 10, type: 'active', element: 'Veneno', description: 'Implanta bomba de veneno no alvo. Explode ao morrer.', requires: [{ skillId: 'as_venom_dust', level: 5 }, { skillId: 'as_enchant_poison', level: 5 }], job_id: 'assassin' },
  { id: 'as_right_hand_mastery', name: 'Right-Hand Mastery', max_level: 5, type: 'passive', description: 'Reduz penalidade de ATK na mão direita ao usar dual-wield.', job_id: 'assassin' },
  { id: 'as_left_hand_mastery', name: 'Left-Hand Mastery', max_level: 5, type: 'passive', description: 'Reduz penalidade de ATK na mão esquerda ao usar dual-wield.', requires: [{ skillId: 'as_right_hand_mastery', level: 3 }], job_id: 'assassin' },
  { id: 'as_katar_mastery', name: 'Katar Mastery', max_level: 10, type: 'passive', description: '+3 ATK por nível com Katar.', job_id: 'assassin' },
  { id: 'as_cloaking', name: 'Cloaking', max_level: 10, type: 'active', description: 'Invisibilidade avançada. Permite movimento.', requires: [{ skillId: 'th_hiding', level: 5 }], job_id: 'assassin' },

  // ─── ROGUE ────────────────────────────────────────────────
  { id: 'rg_steal', name: 'Steal', max_level: 10, type: 'active', description: 'Rouba um item do inventário do monstro.', job_id: 'rogue' },
  { id: 'rg_stripweapon', name: 'Strip Weapon', max_level: 5, type: 'active', description: 'Remove a arma equipada do alvo.', job_id: 'rogue' },
  { id: 'rg_stripshield', name: 'Strip Shield', max_level: 5, type: 'active', description: 'Remove o escudo equipado do alvo.', job_id: 'rogue' },
  { id: 'rg_striparmor', name: 'Strip Armor', max_level: 5, type: 'active', description: 'Remove a armadura equipada do alvo.', requires: [{ skillId: 'rg_stripweapon', level: 3 }], job_id: 'rogue' },
  { id: 'rg_striphelm', name: 'Strip Helm', max_level: 5, type: 'active', description: 'Remove o elmo equipado do alvo.', requires: [{ skillId: 'rg_stripshield', level: 3 }], job_id: 'rogue' },
  { id: 'rg_intimidate', name: 'Intimidate', max_level: 5, type: 'active', description: 'Teletransporta o caster e o alvo para local aleatório.', job_id: 'rogue' },
  { id: 'rg_backstab', name: 'Back Stab', max_level: 10, type: 'active', description: 'Golpe pelas costas causando dano massivo.', job_id: 'rogue' },
  { id: 'rg_raid', name: 'Raid', max_level: 5, type: 'active', description: 'AoE em cone com chance de Stun e Blind.', requires: [{ skillId: 'rg_backstab', level: 3 }], job_id: 'rogue' },
  { id: 'rg_plagiarism', name: 'Plagiarism', max_level: 10, type: 'passive', description: 'Copia a última skill usada por monstro ou jogador.', job_id: 'rogue' },
  { id: 'rg_flagemblem', name: 'Flag Emblem', max_level: 5, type: 'passive', description: 'Aumenta EXP de quest e monstros.', job_id: 'rogue' },
  { id: 'rg_stealcoins', name: 'Snatcher', max_level: 5, type: 'passive', description: 'Chance de roubar automaticamente ao atacar.', requires: [{ skillId: 'rg_steal', level: 5 }], job_id: 'rogue' },

  // ─── PRIEST ───────────────────────────────────────────────
  { id: 'pr_heal', name: 'Heal', max_level: 10, type: 'active', element: 'Sagrado', description: 'Recupera HP de aliado ou causa dano em mortos-vivos.', job_id: 'priest' },
  { id: 'pr_ruwach', name: 'Ruwach', max_level: 1, type: 'active', description: 'Revela inimigos invisíveis e causa dano Sagrado.', job_id: 'priest' },
  { id: 'pr_angelus', name: 'Angelus', max_level: 10, type: 'active', description: 'Buff que aumenta VIT DEF de aliados próximos.', requires: [{ skillId: 'pr_heal', level: 3 }], job_id: 'priest' },
  { id: 'pr_blessing', name: 'Blessing', max_level: 10, type: 'active', description: 'Buff que aumenta STR, DEX e INT. Remove maldições.', requires: [{ skillId: 'pr_heal', level: 5 }], job_id: 'priest' },
  { id: 'pr_agi_up', name: 'Increase AGI', max_level: 10, type: 'active', description: 'Aumenta AGI e velocidade de movimento.', requires: [{ skillId: 'pr_heal', level: 3 }], job_id: 'priest' },
  { id: 'pr_kyrie', name: 'Kyrie Eleison', max_level: 10, type: 'active', element: 'Sagrado', description: 'Escudo sagrado que absorve dano físico.', requires: [{ skillId: 'pr_heal', level: 10 }, { skillId: 'pr_angelus', level: 2 }], job_id: 'priest' },
  { id: 'pr_magnificat', name: 'Magnificat', max_level: 5, type: 'active', description: 'Aumenta regeneração de SP de aliados próximos.', requires: [{ skillId: 'pr_blessing', level: 5 }], job_id: 'priest' },
  { id: 'pr_gloria', name: 'Gloria', max_level: 5, type: 'active', description: 'Aumenta LUCK de aliados próximos.', requires: [{ skillId: 'pr_magnificat', level: 2 }], job_id: 'priest' },
  { id: 'pr_impositio', name: 'Impositio Manus', max_level: 5, type: 'active', description: 'Aumenta ATK de aliado.', requires: [{ skillId: 'pr_heal', level: 5 }], job_id: 'priest' },
  { id: 'pr_resurrect', name: 'Resurrection', max_level: 4, type: 'active', element: 'Sagrado', description: 'Revive jogador morto com parte do HP.', requires: [{ skillId: 'pr_heal', level: 10 }, { skillId: 'pr_blessing', level: 5 }], job_id: 'priest' },
  { id: 'pr_turnundead', name: 'Turn Undead', max_level: 10, type: 'active', element: 'Sagrado', description: 'Tenta destruir monstro morto-vivo instantaneamente.', requires: [{ skillId: 'pr_blessing', level: 5 }, { skillId: 'pr_heal', level: 5 }], job_id: 'priest' },
  { id: 'pr_sanctuary', name: 'Sanctuary', max_level: 10, type: 'active', element: 'Sagrado', description: 'Área de cura contínua no chão.', requires: [{ skillId: 'pr_heal', level: 10 }, { skillId: 'pr_agi_up', level: 5 }], job_id: 'priest' },
  { id: 'pr_aspersio', name: 'Aspersio', max_level: 5, type: 'active', element: 'Sagrado', description: 'Encha a arma do aliado com elemento Sagrado.', requires: [{ skillId: 'pr_blessing', level: 5 }], job_id: 'priest' },
  { id: 'pr_suffragium', name: 'Suffragium', max_level: 3, type: 'active', description: 'Reduz cast time do alvo aliado.', requires: [{ skillId: 'pr_agi_up', level: 3 }], job_id: 'priest' },
  { id: 'pr_mace_mastery', name: 'Mace Mastery', max_level: 10, type: 'passive', description: '+3 ATK por nível com maças.', job_id: 'priest' },

  // ─── MONK ─────────────────────────────────────────────────
  { id: 'mo_tripleattack', name: 'Triple Attack', max_level: 10, type: 'passive', description: 'Chance de atacar 3x em sequência com soco.', job_id: 'monk' },
  { id: 'mo_bodyrelocation', name: 'Body Relocation', max_level: 1, type: 'active', description: 'Teletransporta instantaneamente para célula alvo. Consome 1 Spirit Sphere.', requires: [{ skillId: 'mo_tripleattack', level: 5 }], job_id: 'monk' },
  { id: 'mo_fingeroffensive', name: 'Finger Offensive', max_level: 5, type: 'active', description: 'Dispara Spirit Spheres causando dano Fantasma à distância.', requires: [{ skillId: 'mo_tripleattack', level: 5 }], job_id: 'monk' },
  { id: 'mo_callspirits', name: 'Call Spirits', max_level: 5, type: 'active', description: 'Invoca Spirit Spheres ao redor do Monk.', job_id: 'monk' },
  { id: 'mo_absorbspirits', name: 'Absorb Spirits', max_level: 1, type: 'active', description: 'Absorve todas as Spirit Spheres para recuperar SP.', requires: [{ skillId: 'mo_callspirits', level: 1 }], job_id: 'monk' },
  { id: 'mo_investigate', name: 'Investigate', max_level: 5, type: 'active', description: 'Ignora DEF e VIT DEF do alvo.', requires: [{ skillId: 'mo_fingeroffensive', level: 3 }], job_id: 'monk' },
  { id: 'mo_explosionspirits', name: 'Explosion Spirits', max_level: 5, type: 'active', description: 'Consome todas as Spirit Spheres para aumentar ATK, CRIT e HIT massivamente.', requires: [{ skillId: 'mo_callspirits', level: 5 }], job_id: 'monk' },
  { id: 'mo_steelbody', name: 'Steel Body', max_level: 5, type: 'active', description: 'Aumenta DEF e MDEF ao máximo mas reduz ASPD e velocidade ao mínimo.', requires: [{ skillId: 'mo_explosionspirits', level: 3 }], job_id: 'monk' },
  { id: 'mo_bladestop', name: 'Blade Stop', max_level: 5, type: 'active', description: 'Para um ataque físico do inimigo e fica em impasse com ele.', requires: [{ skillId: 'mo_bodyrelocation', level: 1 }], job_id: 'monk' },
  { id: 'mo_combofinish', name: 'Combo Finish', max_level: 5, type: 'active', description: 'Golpe final de combo com dano elevado.', requires: [{ skillId: 'mo_tripleattack', level: 5 }, { skillId: 'mo_bladestop', level: 3 }], job_id: 'monk' },
  { id: 'mo_dodge', name: 'Dodge', max_level: 10, type: 'passive', description: 'Aumenta Flee passivamente.', job_id: 'monk' },
  { id: 'mo_chaincombo', name: 'Chain Combo', max_level: 5, type: 'active', description: 'Combo de 4 golpes rápidos.', requires: [{ skillId: 'mo_tripleattack', level: 5 }], job_id: 'monk' },

  // ─── LORD KNIGHT ──────────────────────────────────────────
  { id: 'lk_aurablade', name: 'Aura Blade', max_level: 5, type: 'active', description: 'Envolve a arma em uma aura que adiciona dano fixo por 60s.', job_id: 'lord-knight' },
  { id: 'lk_parrying', name: 'Parrying', max_level: 10, type: 'active', description: 'Chance de bloquear ataques físicos com espada de duas mãos.', requires: [{ skillId: 'kn_twohand_quicken', level: 5 }], job_id: 'lord-knight' },
  { id: 'lk_tensionrelax', name: 'Tension Relax', max_level: 1, type: 'active', description: 'Senta e regenera HP rapidamente.', job_id: 'lord-knight' },
  { id: 'lk_berserk', name: 'Berserk', max_level: 1, type: 'active', description: 'Estado berserk: HP cai para 100, SP para 0, mas ATK e ASPD aumentam drasticamente.', requires: [{ skillId: 'lk_aurablade', level: 5 }, { skillId: 'lk_parrying', level: 5 }, { skillId: 'lk_tensionrelax', level: 1 }], job_id: 'lord-knight' },
  { id: 'lk_spiralpierce', name: 'Spiral Pierce', max_level: 5, type: 'active', description: 'Perfura o alvo com lança em espiral causando dano neutro ignorando cards de redução.', requires: [{ skillId: 'kn_spear_boomerang', level: 3 }], job_id: 'lord-knight' },
  { id: 'lk_headcrush', name: 'Head Crush', max_level: 5, type: 'active', description: 'Golpe que causa sangramento no alvo.', requires: [{ skillId: 'kn_brandish_spear', level: 5 }], job_id: 'lord-knight' },
  { id: 'lk_jointbeat', name: 'Joint Beat', max_level: 10, type: 'active', description: 'Golpe com lança que aleatoriza penalidade nas juntas do alvo.', requires: [{ skillId: 'lk_headcrush', level: 5 }], job_id: 'lord-knight' },
  { id: 'lk_crush_strike', name: 'Crush Strike', max_level: 1, type: 'active', description: 'Destrói a arma equipada para causar dano enorme.', job_id: 'lord-knight' },

  // ─── PALADIN ──────────────────────────────────────────────
  { id: 'pa_shieldchain', name: 'Shield Chain', max_level: 5, type: 'active', description: 'Arremessa o escudo 5 vezes em sequência rápida.', requires: [{ skillId: 'cr_shieldboomerang', level: 5 }], job_id: 'paladin' },
  { id: 'pa_sacrifice', name: "Sacrifice (Martyr's Reckoning)", max_level: 5, type: 'active', description: 'Sacrifica % do HP próprio para causar dano ignorando DEF.', requires: [{ skillId: 'cr_devotion', level: 5 }], job_id: 'paladin' },
  { id: 'pa_gospel', name: 'Battle Chant (Gospel)', max_level: 10, type: 'active', description: 'Hino sagrado aleatório: pode buff aliados ou debuff inimigos.', requires: [{ skillId: 'cr_grand_cross', level: 5 }, { skillId: 'cr_devotion', level: 5 }], job_id: 'paladin' },
  { id: 'pa_pressure', name: 'Holy Word (Pressure)', max_level: 5, type: 'active', element: 'Sagrado', description: 'Dano fixo ignorando DEF, MDEF e elemento. Remove buffs do alvo.', job_id: 'paladin' },
  { id: 'pa_magicrod', name: 'Magic Rod', max_level: 5, type: 'active', description: 'Chance de absorver magia direcionada ao Paladin.', job_id: 'paladin' },
  { id: 'pa_piety', name: 'Piety', max_level: 5, type: 'active', element: 'Sagrado', description: 'Ativa elemento Sagrado na própria armadura e de aliados próximos.', requires: [{ skillId: 'cr_endure', level: 5 }], job_id: 'paladin' },

  // ─── HIGH WIZARD ──────────────────────────────────────────
  { id: 'hw_magicpower', name: 'Magic Power', max_level: 10, type: 'active', description: 'Aumenta MATK em 100% para a próxima skill mágica usada.', job_id: 'high-wizard' },
  { id: 'hw_ganbantein', name: 'Ganbantein', max_level: 1, type: 'active', description: 'Remove todas as habilidades de área de uma célula.', requires: [{ skillId: 'wz_quagmire', level: 3 }, { skillId: 'wz_earthspike', level: 3 }], job_id: 'high-wizard' },
  { id: 'hw_napalmvulcan', name: 'Napalm Vulcan', max_level: 5, type: 'active', element: 'Fantasma', description: 'Dispara múltiplos projéteis de Napalm no alvo.', requires: [{ skillId: 'mg_napalmbeat', level: 7 }], job_id: 'high-wizard' },
  { id: 'hw_gravitation', name: 'Gravitation Field', max_level: 5, type: 'active', description: 'Campo gravitacional AoE com dano periódico e reduz ASPD dos inimigos.', requires: [{ skillId: 'wz_meteor_storm', level: 3 }, { skillId: 'wz_lord_of_vermillion', level: 3 }, { skillId: 'wz_stormgust', level: 3 }], job_id: 'high-wizard' },
  { id: 'hw_meltdown', name: 'Meltdown', max_level: 5, type: 'active', element: 'Fogo', description: 'Derrete arma e armadura do alvo, reduzindo gradualmente a defesa.', requires: [{ skillId: 'wz_firebolt', level: 7 }], job_id: 'high-wizard' },
  { id: 'hw_souldrain', name: 'Soul Drain', max_level: 10, type: 'passive', description: 'Recupera SP ao matar inimigos com magias.', job_id: 'high-wizard' },
  { id: 'hw_kaahi', name: 'Kaahi', max_level: 7, type: 'active', description: 'Ao receber dano físico, gasta SP para recuperar HP automaticamente.', job_id: 'high-wizard' },
  { id: 'hw_kaizel', name: 'Kaizel', max_level: 6, type: 'active', description: 'Ressuscita automaticamente ao morrer com % de HP.', job_id: 'high-wizard' },
  { id: 'hw_kaupe', name: 'Kaupe', max_level: 3, type: 'active', description: 'Concede chance de esquivar completamente de ataques físicos por 3 cargas.', job_id: 'high-wizard' },
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (handleOptions(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const secret = process.env.SEED_SECRET
  const provided = req.headers['x-seed-secret'] ?? req.body?.secret

  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized. Provide x-seed-secret header.' })
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    return res.status(500).json({ error: 'Missing Supabase env vars.' })
  }

  const supabase = createClient(url, key)

  const { error, count } = await supabase
    .from('skills')
    .upsert(skills, { onConflict: 'id', count: 'exact' })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({
    ok: true,
    message: `Seed concluído! ${count ?? skills.length} skills inseridas/atualizadas.`,
  })
}
