const setAutoText = (project) => {
  var result = autoText(
    project.qldFunding,
    project.totalQldFunding,
    project.ownSrcFunding,
    project.totalOwnSrcFunding,
    project.fedFunding,
    project.totalFedFunding,
    project.localFunding,
    project.totalLocalFunding,
    project.privateFunding,
    project.totalPrivateFunding,
    project.description,
    project.qldProgramName,
    project.fedProgramName,
    project.localPartner,
    project.isQldFunding,
    project.isFedFunding,
    project.overideDescription,
    null,
    project.qaDescription,
    project.trDescription,
    project.qldProgramState,
    project.fedProgramState,
    project.activityWord // ✅ added
  );
  return result.text;
};

const autoText = (
  sumBYQLD,
  sumTotalQLD,
  sumBYOwnSource,
  sumTotalOwnSource,
  sumBYFED,
  sumTotalFED,
  sumBYLG,
  sumTotalLG,
  sumBYPvt,
  sumTotalPvt,
  activeDesc,
  strQLDProg,
  strFEDProg,
  strLGName,
  isPartQLD,
  isPartFed,
  descOveride,
  role,
  qaDesc,
  trDesc,
  partQLDState,
  partFedState,
  activityWord // ✅ added
) => {

  var blankBY = (!sumBYQLD && sumBYQLD !== 0) || (!sumBYOwnSource && sumBYOwnSource !== 0);
  var blankTotal = sumTotalQLD == null || sumTotalOwnSource == null || sumTotalQLD === '' || sumTotalOwnSource === '';

  sumBYQLD = !sumBYQLD ? 0 : sumBYQLD;
  sumBYOwnSource = !sumBYOwnSource ? 0 : sumBYOwnSource;
  sumBYFED = !sumBYFED ? 0 : sumBYFED;
  sumBYLG = !sumBYLG ? 0 : sumBYLG;
  sumBYPvt = !sumBYPvt ? 0 : sumBYPvt;

  sumTotalQLD = !sumTotalQLD ? 0 : sumTotalQLD;
  sumTotalOwnSource = !sumTotalOwnSource ? 0 : sumTotalOwnSource;
  sumTotalFED = !sumTotalFED ? 0 : sumTotalFED;
  sumTotalLG = !sumTotalLG ? 0 : sumTotalLG;
  sumTotalPvt = !sumTotalPvt ? 0 : sumTotalPvt;

  role = typeof role !== 'undefined' ? role : null;

  isPartQLD = strQLDProg && strQLDProg.length > 0 && partQLDState != ProgramState.EXCLUDED;
  isPartFed = strFEDProg && strFEDProg.length > 0 && partFedState != ProgramState.EXCLUDED;

  activeDesc = !activeDesc ? '' : activeDesc.trim();
  qaDesc = !qaDesc ? '' : qaDesc.trim();
  trDesc = !trDesc ? '' : trDesc.trim();

  var BYFunds = sumBYQLD + sumBYOwnSource + sumBYFED + sumBYLG + sumBYPvt;
  var TotalFunds = sumTotalQLD + sumTotalOwnSource + sumTotalFED + sumTotalLG + sumTotalPvt;

  var BY = BudgetYear;

  var dispFinal;
  var dispDel = '';
  var dispPart = [];
  var dispPartners = '';
  var dispProgs;
  var BYFundsView, TotalFundsView;
  var valid = true;

  if (!BYFunds && blankBY) {
    BYFundsView = '<Funds>';
    valid = false;
  } else {
    BYFundsView = money(BYFunds);
  }

  if (!TotalFunds && blankTotal) {
    TotalFundsView = '<Total Funds>';
    valid = false;
  } else {
    TotalFundsView = money(TotalFunds);
  }

  if (TotalFundsView.indexOf('<') == 0 || BYFundsView.indexOf('<') == 0) {
    valid = false;
  }

  if (trDesc && trDesc.length > 0) {
    activeDesc = trDesc;
  } else if (qaDesc && qaDesc.length > 0) {
    activeDesc = qaDesc;
  }

  if (descOveride && descOveride.trim().length > 0) {
    descOveride = descOveride.trim();
  } else if (activeDesc && activeDesc.length > 0) {
    activeDesc += (activeDesc.charAt(activeDesc.length - 1) == '.' ? ' ' : '. ');
  } else {
    activeDesc = '<Active Text> ';
    valid = false;
  }

  if (!strQLDProg || strQLDProg.length === 0) {
    strQLDProg = '<QLD Program Name>';
  }

  if (!strFEDProg || strFEDProg.length === 0) {
    strFEDProg = '<FED Program Name>';
  }

  if (!strLGName || strLGName.length === 0) {
    strLGName = '<Local Government Partner>';
  }

  if (isPartFed) {
    if (isPartQLD) {
      dispProgs = 'Part of the ' + strQLDProg + ' and the ' + strFEDProg;
      if (strQLDProg.indexOf('<') == 0 || strFEDProg.indexOf('<') == 0) {
        valid = false;
      }
    } else {
      dispProgs = 'Part of the ' + strFEDProg;
      if (strFEDProg.indexOf('<') == 0) {
        valid = false;
      }
    }
  } else {
    if (isPartQLD) {
      dispProgs = 'Part of the ' + strQLDProg;
      if (strQLDProg.indexOf('<') == 0) {
        valid = false;
      }
    } else {
      dispProgs = '';
    }
  }

  var boolBYFED = (sumBYFED > 0 && !isPartFed);
  var boolBYLG = (sumBYLG > 0);
  var boolBYPvt = (sumBYPvt > 0);

  dispDel = dispProgs.length > 0
    ? ', delivered in partnership with'
    : ' Delivered in partnership with';

  if (boolBYPvt) {
    dispPart.push(' the private sector');
  }

  if (boolBYLG) {
    if (strLGName == 'Multiple Regional Councils') {
      dispPart.push(' local government');
    } else {
      dispPart.push(' the ' + strLGName);
    }

    if (strLGName.indexOf('<') == 0) {
      valid = false;
    }
  }

  if (boolBYFED) {
    dispPart.push(" the Australian Government");
  }

  if (sumBYFED > 0 && isPartFed) {
    dispPart.push(" the Australian Government");
  }

  if (dispPart.length == 3) {
    dispPartners = dispPart[2] + ',' + dispPart[1] + ' and' + dispPart[0];
  } else if (dispPart.length == 2) {
    dispPartners = dispPart[1] + ' and' + dispPart[0];
  } else if (dispPart.length == 1) {
    dispPartners = dispPart[0];
  } else {
    dispDel = '';
  }

  // ✅ activity word prefix
  var activityWordPrefix =
    activityWord && activityWord.trim().length > 0
      ? activityWord.trim() + ' '
      : '';

  // ✅ funding removed here
  dispFinal =
    activityWordPrefix +
    activeDesc +
    dispProgs +
    dispDel +
    dispPartners;

  if (dispProgs.length > 0 || dispPartners.length > 0) {
    dispFinal += '.';
  }

  var output = {
    valid: valid,
    text: dispFinal
  };

  if (descOveride && descOveride.length > 0) {
    output.text = descOveride;
  }

  return output;
};

const money = (input) => {
  var MILLION = 1000000;
  var BILLION = 1000000000;

  if (input < 1) {
    return '$' + (Math.round(input * 100) / 100).toFixed(2);
  }

  if (input < MILLION) {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(input);
  }

  if (input >= MILLION && input < BILLION) {
    return '$' + (Math.round((input / MILLION) * 10) / 10) + ' million';
  }

  if (input >= BILLION) {
    return '$' + (Math.round((input / BILLION) * 1000) / 1000) + ' billion';
  }
};
